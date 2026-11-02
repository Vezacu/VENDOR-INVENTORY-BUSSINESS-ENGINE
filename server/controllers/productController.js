const pool = require("../config/db");

const listProducts = async (req, res) => {
    try {
        const values = [];
        let sellerFilter = "";
        if (req.user.role !== "admin") {
            values.push(req.user.id);
            sellerFilter = "WHERE s.user_id = $1";
        }
        const result = await pool.query(
            `SELECT p.id, p.shop_id, s.shop_name, p.name, p.category, p.description,
                    p.price, p.image, p.images, p.stock, p.availability, p.created_at
             FROM products p
             JOIN shops s ON s.id = p.shop_id
             ${sellerFilter}
             ORDER BY p.created_at DESC`,
            values
        );
        return res.json({ products: result.rows });
    } catch (error) {
        console.error("Product list error:", error);
        return res.status(500).json({ message: "Could not load products" });
    }
};

const listProductShops = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, shop_name
             FROM shops
             ORDER BY shop_name`
        );
        return res.json({ shops: result.rows });
    } catch (error) {
        console.error("Shop list error:", error);
        return res.status(500).json({ message: "Could not load shops" });
    }
};

const createProduct = async (req, res) => {
    const { name, category, description = "", price, stock = 0, images = [], shopId } = req.body;

    if (!name?.trim() || !category?.trim() || !Number.isFinite(Number(price)) || Number(price) <= 0) {
        return res.status(400).json({ message: "Product name, category, and a price greater than zero are required" });
    }
    if (!Number.isInteger(Number(stock)) || Number(stock) < 0) {
        return res.status(400).json({ message: "Stock must be a whole number of zero or more" });
    }
    if (!Array.isArray(images) || images.length > 5 || images.some((image) => typeof image !== "string" || !image.startsWith("https://res.cloudinary.com/"))) {
        return res.status(400).json({ message: "Add up to five valid Cloudinary image URLs" });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        let selectedShopId = shopId;
        if (req.user.role === "admin") {
            if (!Number.isInteger(Number(shopId))) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Choose a seller shop for this product" });
            }
            const shop = await client.query("SELECT id FROM shops WHERE id = $1", [Number(shopId)]);
            if (!shop.rowCount) {
                await client.query("ROLLBACK");
                return res.status(404).json({ message: "The selected shop could not be found" });
            }
            selectedShopId = Number(shopId);
        } else {
            const seller = await client.query(
                "SELECT id, name FROM users WHERE id = $1 AND role = 'seller' FOR UPDATE",
                [req.user.id]
            );
            if (!seller.rowCount) {
                await client.query("ROLLBACK");
                return res.status(403).json({ message: "A seller account is required to create products" });
            }
            let shop = await client.query("SELECT id FROM shops WHERE user_id = $1", [req.user.id]);
            if (!shop.rowCount) {
                const baseSlug = `${seller.rows[0].name}-shop`
                    .normalize("NFKD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "") || `shop-${req.user.id}`;
                const slugs = await client.query(
                    "SELECT slug FROM shops WHERE slug = $1 OR slug LIKE $2",
                    [baseSlug, `${baseSlug}-%`]
                );
                const existingSlugs = new Set(slugs.rows.map((row) => row.slug));
                let slug = baseSlug;
                let suffix = 2;
                while (existingSlugs.has(slug)) {
                    slug = `${baseSlug}-${suffix}`;
                    suffix += 1;
                }
                shop = await client.query(
                    `INSERT INTO shops (user_id, shop_name, slug)
                     VALUES ($1, $2, $3)
                     RETURNING id`,
                    [req.user.id, `${seller.rows[0].name}'s Shop`, slug]
                );
            }
            selectedShopId = shop.rows[0].id;
        }

        const result = await client.query(
            `INSERT INTO products (shop_id, name, category, description, price, image, images, stock, availability)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
             RETURNING id, shop_id, name, category, description, price, image, images, stock, availability, created_at`,
            [
                selectedShopId,
                name.trim(),
                category.trim(),
                description.trim(),
                Number(price),
                images[0] || null,
                JSON.stringify(images),
                Number(stock),
                true
            ]
        );
        await client.query("COMMIT");
        return res.status(201).json({ message: "Product saved successfully", product: result.rows[0] });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Product creation error:", error);
        return res.status(500).json({ message: "Could not save the product. Please try again." });
    } finally {
        client.release();
    }
};

const updateProductDetails = async (req, res) => {
    const productId = Number(req.params.id);
    const { name, category, price, images } = req.body || {};

    if (!Number.isInteger(productId) || productId < 1) {
        return res.status(400).json({ message: "A valid product is required" });
    }
    if (typeof name !== "string" || !name.trim() || name.trim().length > 150
        || typeof category !== "string" || !category.trim() || category.trim().length > 80
        || !Number.isFinite(Number(price)) || Number(price) <= 0 || Number(price) > 99999999.99
        || !Array.isArray(images) || images.length > 5
        || images.some((image) => typeof image !== "string"
            || image.length > 2000
            || !image.startsWith("https://res.cloudinary.com/"))) {
        return res.status(400).json({ message: "Enter a product name, category, positive price, and up to five valid product images" });
    }

    try {
        const result = await pool.query(
            `UPDATE products p
             SET name = $1, category = $2, price = $3,
                 image = $4, images = $5::jsonb
             FROM shops s
             WHERE p.shop_id = s.id
               AND p.id = $6
               AND ($7 = 'admin' OR s.user_id = $8)
             RETURNING p.id, p.shop_id, p.name, p.category, p.price,
                       p.image, p.images, p.stock, p.availability`,
            [
                name.trim(),
                category.trim(),
                Number(price),
                images[0] || null,
                JSON.stringify(images),
                productId,
                req.user.role,
                req.user.id
            ]
        );
        if (!result.rowCount) {
            return res.status(404).json({ message: "Product could not be found" });
        }
        return res.json({ message: "Product details updated", product: result.rows[0] });
    } catch (error) {
        console.error("Product details update error:", error);
        return res.status(500).json({ message: "Could not update product details" });
    }
};

const updateProductInventory = async (req, res) => {
    const productId = Number(req.params.id);
    const { stock, availability } = req.body;

    if (!Number.isInteger(productId) || productId < 1) {
        return res.status(400).json({ message: "A valid product is required" });
    }
    if (!Number.isInteger(Number(stock)) || Number(stock) < 0) {
        return res.status(400).json({ message: "Stock must be a whole number of zero or more" });
    }
    if (typeof availability !== "boolean") {
        return res.status(400).json({ message: "Choose whether this product is shown in the shop" });
    }

    try {
        const result = await pool.query(
            `UPDATE products p
             SET stock = $1, availability = $2
             FROM shops s
             WHERE p.shop_id = s.id
               AND p.id = $3
               AND ($4 = 'admin' OR s.user_id = $5)
             RETURNING p.id, p.stock, p.availability`,
            [Number(stock), availability, productId, req.user.role, req.user.id]
        );
        if (!result.rowCount) {
            return res.status(404).json({ message: "Product could not be found" });
        }
        return res.json({ message: "Inventory updated", product: result.rows[0] });
    } catch (error) {
        console.error("Product inventory update error:", error);
        return res.status(500).json({ message: "Could not update product inventory" });
    }
};

module.exports = { listProducts, listProductShops, createProduct, updateProductDetails, updateProductInventory };
