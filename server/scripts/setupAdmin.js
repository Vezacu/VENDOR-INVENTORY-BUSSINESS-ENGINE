const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const bcrypt = require("bcrypt");
const pool = require("../config/db");

const setupAdmin = async () => {
    const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (typeof ADMIN_PASSWORD !== "string" || ADMIN_PASSWORD.length < 8) {
        throw new Error("Set ADMIN_PASSWORD to at least 8 characters before running setup-admin");
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const currentAdmin = await client.query(
            "SELECT id, name, email FROM users WHERE role = 'admin' FOR UPDATE"
        );
        const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

        if (currentAdmin.rowCount) {
            const admin = currentAdmin.rows[0];
            const email = ADMIN_EMAIL?.trim() || admin.email;
            const name = ADMIN_NAME?.trim() || admin.name;
            const matchingUser = await client.query(
                "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2",
                [email, admin.id]
            );
            if (matchingUser.rowCount) {
                throw new Error("That email is already used by another account; no account was changed");
            }
            await client.query(
                "UPDATE users SET name = $1, email = $2, password = $3 WHERE id = $4",
                [name, email, passwordHash, admin.id]
            );
            await client.query("COMMIT");
            console.log(`Admin credentials updated for ${email}.`);
            return;
        }

        if (!ADMIN_NAME?.trim() || !ADMIN_EMAIL?.trim()) {
            throw new Error("No admin exists yet. Set ADMIN_NAME and ADMIN_EMAIL to create the first admin");
        }

        const matchingUser = await client.query(
            "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
            [ADMIN_EMAIL.trim()]
        );
        if (matchingUser.rowCount) {
            throw new Error("That email is already used by a non-admin account; no account was changed");
        }

        await client.query(
            `INSERT INTO users (name, email, password, role)
             VALUES ($1, $2, $3, 'admin')`,
            [ADMIN_NAME.trim(), ADMIN_EMAIL.trim(), passwordHash]
        );
        await client.query("COMMIT");
        console.log("Admin account created.");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

setupAdmin()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
