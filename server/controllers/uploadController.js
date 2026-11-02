const cloudinary = require("../config/cloudinary");

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

module.exports = { uploadProductImage, uploadReviewImage, uploadCustomOrderImage, uploadCustomerAvatar };
