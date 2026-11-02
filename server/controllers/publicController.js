const pool = require("../config/db");

const listPublicProducts = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.id, p.shop_id, s.slug AS shop_slug, s.shop_name, s.description AS shop_description,
                    p.name, p.category, p.description, p.price, p.image, p.images,
                    p.stock, p.availability,
                    COALESCE(AVG(r.rating), 0)::numeric(2,1) AS rating,
                    COUNT(r.id)::integer AS review_count
             FROM products p
             JOIN shops s ON s.id = p.shop_id
             LEFT JOIN reviews r ON r.product_id = p.id
             WHERE p.availability = TRUE
             GROUP BY p.id, s.slug, s.shop_name, s.description
             ORDER BY p.created_at DESC`
        );
        return res.json({ products: result.rows });
    } catch (error) {
        console.error("Public product list error:", error);
        return res.status(500).json({ message: "Could not load products" });
    }
};

const getDefaultShop = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, user_id, shop_name, slug, description, instagram_link,
                    other_social_link, announcement, content, hero_image
             FROM shops ORDER BY id LIMIT 1`
        );
        if (!result.rowCount) {
            return res.status(404).json({ message: "The maker’s shop could not be found" });
        }
        const shop = result.rows[0];
        const products = await pool.query(
            `SELECT p.id, p.shop_id, p.name, p.category, p.description, p.price,
                    p.image, p.images, p.stock, p.availability,
                    COALESCE(AVG(r.rating), 0)::numeric(2,1) AS rating,
                    COUNT(r.id)::integer AS review_count
             FROM products p
             LEFT JOIN reviews r ON r.product_id = p.id
             WHERE p.shop_id = $1 AND p.availability = TRUE
             GROUP BY p.id
             ORDER BY p.created_at DESC`,
            [shop.id]
        );
        return res.json({ shop, products: products.rows });
    } catch (error) {
        console.error("Default shop lookup failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not load the maker’s shop" });
    }
};

const getPublicShop = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, user_id, shop_name, slug, description, instagram_link, other_social_link,
                    announcement, content, hero_image
             FROM shops WHERE slug = $1`,
            [req.params.slug]
        );
        if (!result.rowCount) {
            return res.status(404).json({ message: "Shop could not be found" });
        }

        const shop = result.rows[0];
        const products = await pool.query(
            `SELECT p.id, p.shop_id, p.name, p.category, p.description, p.price,
                    p.image, p.images, p.stock, p.availability,
                    COALESCE(AVG(r.rating), 0)::numeric(2,1) AS rating,
                    COUNT(r.id)::integer AS review_count
             FROM products p
             LEFT JOIN reviews r ON r.product_id = p.id
             WHERE p.shop_id = $1 AND p.availability = TRUE
             GROUP BY p.id
             ORDER BY p.created_at DESC`,
            [shop.id]
        );
        return res.json({ shop, products: products.rows });
    } catch (error) {
        console.error("Public shop error:", error);
        return res.status(500).json({ message: "Could not load this shop" });
    }
};

module.exports = { listPublicProducts, getPublicShop, getDefaultShop };
