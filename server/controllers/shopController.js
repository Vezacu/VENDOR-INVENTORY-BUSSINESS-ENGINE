const pool = require("../config/db");

const getMyShop = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, shop_name, slug, description, instagram_link, other_social_link,
                    announcement, content, hero_image
             FROM shops WHERE user_id = $1`,
            [req.user.id]
        );
        if (!result.rowCount) {
            return res.status(404).json({ message: "Your shop could not be found" });
        }
        return res.json({ shop: result.rows[0] });
    } catch (error) {
        console.error("Shop settings load error:", error);
        return res.status(500).json({ message: "Could not load shop settings" });
    }
};

const updateMyShop = async (req, res) => {
    const { shopName, description, content, heroImage } = req.body;
    const allowedContentKeys = new Set([
        "homeTitle",
        "homeHighlight",
        "homeText",
        "homeNote",
        "homePrimaryAction",
        "homeSecondaryAction",
        "homeNoteFooter",
        "homeArtCaption",
        "footerTagline",
        "footerCredit",
        "logoText",
        "logoImage",
        "benefitOneTitle",
        "benefitOneText",
        "benefitTwoTitle",
        "benefitTwoText",
        "benefitThreeTitle",
        "benefitThreeText",
        "benefitFourTitle",
        "benefitFourText",
        "featuredEyebrow",
        "featuredTitle",
        "featuredText",
        "featuredAction",
        "sellerBannerEyebrow",
        "sellerBannerTitle",
        "sellerBannerText",
        "sellerBannerAction",
        "shopEyebrow",
        "shopTitle",
        "shopText",
        "customTitle",
        "customHeading",
        "customText",
        "instagramUrl",
        "twitterUrl",
        "facebookUrl",
        "blueskyUrl",
        "contactEmail",
        "contactPhone"
    ]);
    const socialUrlKeys = new Set(["instagramUrl", "twitterUrl", "facebookUrl", "blueskyUrl"]);
    const imageUrlKeys = new Set(["logoImage"]);

    if (typeof shopName !== "string" || !shopName.trim() || shopName.length > 150
        || typeof description !== "string" || description.length > 500
        || !content || typeof content !== "object" || Array.isArray(content)
        || typeof heroImage !== "string"
        || (heroImage && !heroImage.startsWith("https://res.cloudinary.com/"))) {
        return res.status(400).json({ message: "Shop details are invalid" });
    }
    const contentEntries = Object.entries(content);
    if (contentEntries.some(([key, value]) => !allowedContentKeys.has(key)
        || typeof value !== "string" || value.length > 500
        || (socialUrlKeys.has(key) && value.trim() && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value.trim()))
        || (imageUrlKeys.has(key) && value && !value.startsWith("https://res.cloudinary.com/"))
        || (key === "contactEmail" && value.length > 150)
        || (key === "contactPhone" && value.trim() && (value.length > 30 || !/^[0-9+().\-\s]+$/.test(value.trim()))))) {
        return res.status(400).json({ message: "Shop page text is invalid or too long" });
    }

    try {
        const result = await pool.query(
            `UPDATE shops
             SET shop_name = $1, description = $2, content = $3::jsonb, hero_image = $4
             WHERE user_id = $5
             RETURNING id, shop_name, slug, description, instagram_link, other_social_link,
                       announcement, content, hero_image`,
            [shopName.trim(), description.trim(), JSON.stringify(content), heroImage || null, req.user.id]
        );
        if (!result.rowCount) {
            return res.status(404).json({ message: "Your shop could not be found" });
        }
        return res.json({ message: "Shop settings saved", shop: result.rows[0] });
    } catch (error) {
        console.error("Shop settings update error:", error);
        return res.status(500).json({ message: "Could not save shop settings" });
    }
};

module.exports = { getMyShop, updateMyShop };
