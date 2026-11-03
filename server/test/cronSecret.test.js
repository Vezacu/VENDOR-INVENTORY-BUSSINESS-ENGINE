const assert = require("node:assert/strict");
const test = require("node:test");
const { requireCronSecret } = require("../middleware/requireCronSecret");

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

const withCronSecret = (secret, callback) => {
    const originalSecret = process.env.CRON_SECRET;
    if (secret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = secret;

    try {
        callback();
    } finally {
        if (originalSecret === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = originalSecret;
    }
};

test("does not allow cleanup when its secret is not configured", () => {
    withCronSecret(undefined, () => {
        const res = createResponse();
        let nextCalled = false;

        requireCronSecret({ get: () => undefined }, res, () => { nextCalled = true; });

        assert.equal(res.statusCode, 503);
        assert.equal(nextCalled, false);
    });
});

test("rejects an invalid cleanup bearer secret", () => {
    withCronSecret("expected-secret", () => {
        const res = createResponse();
        let nextCalled = false;

        requireCronSecret({ get: () => "Bearer incorrect-secret" }, res, () => { nextCalled = true; });

        assert.equal(res.statusCode, 401);
        assert.equal(nextCalled, false);
    });
});

test("accepts the configured cleanup bearer secret", () => {
    withCronSecret("expected-secret", () => {
        const res = createResponse();
        let nextCalled = false;

        requireCronSecret({ get: () => "Bearer expected-secret" }, res, () => { nextCalled = true; });

        assert.equal(nextCalled, true);
    });
});
