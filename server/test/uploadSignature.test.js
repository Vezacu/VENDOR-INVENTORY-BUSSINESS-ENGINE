const assert = require("node:assert/strict");
const test = require("node:test");
const cloudinary = require("../config/cloudinary");
const { createUploadSignature } = require("../controllers/uploadController");

const createResponse = () => ({
    statusCode: 200,
    body: null,
    status(statusCode) {
        this.statusCode = statusCode;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    }
});

test("signs a product upload without exposing the Cloudinary secret", () => {
    const originalEnvironment = {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET
    };
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
    process.env.CLOUDINARY_API_KEY = "test-key";
    process.env.CLOUDINARY_API_SECRET = "test-secret";

    try {
        const req = { body: { kind: "product" }, user: { role: "seller" } };
        const res = createResponse();
        createUploadSignature(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.apiKey, "test-key");
        assert.equal(res.body.apiSecret, undefined);
        assert.equal(res.body.uploadUrl, "https://api.cloudinary.com/v1_1/test-cloud/image/upload");
        assert.equal(res.body.folder, "vibe/products");
        assert.equal(
            res.body.signature,
            cloudinary.utils.api_sign_request({
                timestamp: res.body.timestamp,
                folder: res.body.folder,
                public_id: res.body.public_id
            }, "test-secret")
        );
    } finally {
        if (originalEnvironment.cloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
        else process.env.CLOUDINARY_CLOUD_NAME = originalEnvironment.cloudName;
        if (originalEnvironment.apiKey === undefined) delete process.env.CLOUDINARY_API_KEY;
        else process.env.CLOUDINARY_API_KEY = originalEnvironment.apiKey;
        if (originalEnvironment.apiSecret === undefined) delete process.env.CLOUDINARY_API_SECRET;
        else process.env.CLOUDINARY_API_SECRET = originalEnvironment.apiSecret;
    }
});

test("rejects a customer requesting a seller product upload signature", () => {
    const req = { body: { kind: "product" }, user: { role: "customer" } };
    const res = createResponse();

    createUploadSignature(req, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.message, "You do not have permission to upload this image");
});
