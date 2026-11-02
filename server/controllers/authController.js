const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const createToken = (user) => {
    const tokenSecret = process.env.JWT_SECRET;
    if (!tokenSecret) {
        throw new Error("JWT_SECRET is not configured");
    }

    return jwt.sign({ id: user.id, role: user.role }, tokenSecret, { expiresIn: "8h" });
};

const registerCustomer = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (typeof name !== "string" || !name.trim()
            || typeof email !== "string" || !email.trim()
            || typeof password !== "string" || password.length < 8) {
            return res.status(400).json({ message: "Name, email, and a password of at least 8 characters are required" });
        }
        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET is not configured");
            return res.status(500).json({ message: "Authentication is not configured" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (name, email, password, role)
             VALUES ($1, $2, $3, 'customer')
             RETURNING id, name, email, role, phone, shipping_address, shipping_city, shipping_postal_code, profile_image`,
            [name.trim(), email.trim(), hashedPassword]
        );
        const token = createToken(result.rows[0]);
        const user = result.rows[0];
        return res.status(201).json({
            message: "Customer account created",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                address: user.shipping_address,
                city: user.shipping_city,
                pin: user.shipping_postal_code,
                profileImage: user.profile_image
            }
        });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({ message: "Email already registered" });
        }
        console.error("Customer registration error:", error);
        return res.status(500).json({ message: "Could not create customer account" });
    }
};

// Register seller
const registerSeller = async (req, res) => {
    try {
        const { name, email, password, shopName } = req.body;

        if (!name?.trim() || !email?.trim() || !password || password.length < 8 || shopName?.trim().length > 150) {
            return res.status(400).json({
                message: "Name, email, a shop name of at most 150 characters, and a password of at least 8 characters are required"
            });
        }

        const existingUser = await pool.query(
            "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
            [email.trim()]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                message: "Email already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const client = await pool.connect();
        let result;
        try {
            await client.query("BEGIN");
            const existingSeller = await client.query(
                "SELECT id FROM users WHERE role = 'seller' LIMIT 1 FOR UPDATE"
            );
            if (existingSeller.rowCount) {
                await client.query("ROLLBACK");
                return res.status(409).json({ message: "A seller account already exists" });
            }

            result = await client.query(
                `INSERT INTO users (name, email, password, role)
                 VALUES ($1, $2, $3, 'seller')
                 RETURNING id, name, email, role`,
                [name.trim(), email.trim(), hashedPassword]
            );
            const baseSlug = (shopName?.trim() || `${name.trim()}'s Shop`)
                .normalize("NFKD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "") || `shop-${result.rows[0].id}`;
            const slugResult = await client.query(
                `SELECT slug FROM shops WHERE slug = $1 OR slug LIKE $2`,
                [baseSlug, `${baseSlug}-%`]
            );
            const existingSlugs = new Set(slugResult.rows.map((row) => row.slug));
            let slug = baseSlug;
            let suffix = 2;
            while (existingSlugs.has(slug)) {
                slug = `${baseSlug}-${suffix}`;
                suffix += 1;
            }
            await client.query(
                "INSERT INTO shops (user_id, shop_name, slug) VALUES ($1, $2, $3)",
                [result.rows[0].id, shopName?.trim() || `${name.trim()}'s Shop`, slug]
            );
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }

        res.status(201).json({
            message: "Seller registered successfully",
            user: result.rows[0]
        });

    } catch (error) {
        if (error.code === "23505" && error.constraint === "users_single_seller") {
            return res.status(409).json({ message: "A seller account already exists" });
        }
        if (error.code === "23505" && error.constraint === "users_email_lower_unique") {
            return res.status(409).json({ message: "Email already registered" });
        }
        console.error("Registration error:", error);

        res.status(500).json({
            message: "Server error"
        });
    }
};

// Login seller
const loginSeller = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const result = await pool.query(
            `SELECT id, name, email, password, role, phone, shipping_address,
                    shipping_city, shipping_postal_code, profile_image
             FROM users WHERE LOWER(email) = LOWER($1)`,
            [email.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        let token;
        try {
            token = createToken(user);
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ message: "Authentication is not configured" });
        }

        res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                address: user.shipping_address,
                city: user.shipping_city,
                pin: user.shipping_postal_code,
                profileImage: user.profile_image
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            message: "Server error"
        });
    }
};

const getCustomerProfile = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, role, phone, shipping_address,
                    shipping_city, shipping_postal_code, profile_image
             FROM users
             WHERE id = $1 AND role = 'customer'`,
            [req.user.id]
        );
        if (!result.rowCount) {
            return res.status(404).json({ message: "Customer account could not be found" });
        }
        const user = result.rows[0];
        return res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                address: user.shipping_address,
                city: user.shipping_city,
                pin: user.shipping_postal_code,
                profileImage: user.profile_image
            }
        });
    } catch (error) {
        console.error("Customer profile lookup error:", error.code || "database error");
        return res.status(500).json({ message: "Could not load your account details" });
    }
};

const updateCustomerProfile = async (req, res) => {
    const { name, phone = "", address, city, pin, profileImage = null } = req.body || {};
    if (![name, phone, address, city, pin].every((value) => typeof value === "string")
        || !name.trim() || !address.trim() || !city.trim() || !pin.trim()
        || (profileImage !== null && (typeof profileImage !== "string"
            || profileImage.length > 2000
            || !profileImage.startsWith("https://res.cloudinary.com/")))) {
        return res.status(400).json({ message: "Enter your name, delivery address, city, and PIN code, and choose a valid profile image" });
    }
    if (name.length > 100 || phone.length > 20 || address.length > 1000 || city.length > 100 || pin.length > 20) {
        return res.status(400).json({ message: "One or more delivery details are too long" });
    }

    try {
        const result = await pool.query(
            `UPDATE users
             SET name = $1, phone = $2, shipping_address = $3, shipping_city = $4,
                 shipping_postal_code = $5, profile_image = $6
             WHERE id = $7 AND role = 'customer'
             RETURNING id, name, email, role, phone, shipping_address,
                       shipping_city, shipping_postal_code, profile_image`,
            [name.trim(), phone.trim(), address.trim(), city.trim(), pin.trim(), profileImage, req.user.id]
        );
        if (!result.rowCount) {
            return res.status(404).json({ message: "Customer account could not be found" });
        }
        const user = result.rows[0];
        return res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                address: user.shipping_address,
                city: user.shipping_city,
                pin: user.shipping_postal_code,
                profileImage: user.profile_image
            }
        });
    } catch (error) {
        console.error("Customer profile update error:", error);
        return res.status(500).json({ message: "Could not save delivery details" });
    }
};

module.exports = {
    registerSeller,
    registerCustomer,
    getCustomerProfile,
    loginSeller,
    updateCustomerProfile
};