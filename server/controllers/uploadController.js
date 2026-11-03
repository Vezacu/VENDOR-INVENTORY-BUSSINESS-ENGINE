const crypto = require("crypto");
const cloudinary = require("../config/cloudinary");

const uploadTargets = {
    product: { folder: "vibe/products", roles: ["admin", "seller"] },
    review: { folder: "vibe/reviews", roles: ["customer"] },
    customOrder: { folder: "vibe/custom-orders", roles: ["customer"] },
    customerAvatar: { folder: "vibe/customer-avatars", roles: ["customer"] }
};

const createUploadSignature = (req, res) => {
    const target = uploadTargets[req.body?.kind];
    if (!target) {
        return res.status(400).json({ message: "Choose a valid image upload type" });
    }
    if (!target.roles.includes(req.user.role)) {
        return res.status(403).json({ message: "You do not have permission to upload this image" });
    }

    const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env;
    if (!cloudName || !apiKey || !apiSecret) {
        console.error("Cloudinary credentials are not fully configured");
        return res.status(503).json({ message: "Image uploads are not configured" });
    }

    const params = {
        timestamp: Math.floor(Date.now() / 1000),
        folder: target.folder,
        public_id: crypto.randomUUID()
    };

    return res.json({
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        apiKey,
        ...params,
        signature: cloudinary.utils.api_sign_request(params, apiSecret)
    });
};

const uploadImage = async (req, res, folder, label) => {
    if (!req.file) {
        return res.status(400).json({ message: "Choose an image to upload" });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        console.error("Cloudinary credentials are not fully configured");
        return res.status(503).json({ message: "Image uploads are not configured" });
    }

    try {
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    resource_type: "image",
                    unique_filename: true,
                    overwrite: false
                },
                (error, uploadedImage) => {
                    if (error) return reject(error);
                    return resolve(uploadedImage);
                }
            );
            stream.end(req.file.buffer);
        });

        return res.status(201).json({
            image: {
                url: result.secure_url,
                publicId: result.public_id
            }
        });
    } catch (error) {
        console.error(`${label} image upload failed:`, error);
        return res.status(502).json({ message: "The image could not be uploaded. Please try again." });
    }
};

const uploadProductImage = (req, res) => uploadImage(req, res, "vibe/products", "Product");
const uploadReviewImage = (req, res) => uploadImage(req, res, "vibe/reviews", "Review");
const uploadCustomOrderImage = (req, res) => uploadImage(req, res, "vibe/custom-orders", "Custom order");
const uploadCustomerAvatar = (req, res) => uploadImage(req, res, "vibe/customer-avatars", "Customer profile");

module.exports = {
    createUploadSignature,
    uploadProductImage,
    uploadReviewImage,
    uploadCustomOrderImage,
    uploadCustomerAvatar
};
