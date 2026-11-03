# VIBE

VIBE is a handmade marketplace with a React/Vite storefront and an Express API. Both workspaces live in this repository and can be installed, built, tested, and deployed from this project root.

## Requirements

- Node.js 20.19 or newer
- npm
- PostgreSQL
- Cloudinary credentials for image uploads
- Razorpay Test Mode credentials for checkout

## Install and run locally

From the VIBE project root:

```powershell
npm install
Copy-Item .env.example .env
```

Add your local database, JWT, Cloudinary, and Razorpay **Test Mode** settings to the root `.env` file. Do not commit `.env` or use live payment credentials for local testing.

Initialize a new database with `server/database.sql`. For an existing database, apply the migrations in order from `server/migrations/`; see [server setup notes](./server/README.md).

Run the API and storefront together:

```powershell
npm run dev
```

The storefront runs at `http://localhost:5173`, and the API runs at `http://localhost:5000`. To run them separately, use `npm run dev:client` or `npm run dev:server`.

## Deploy to Vercel

Import this repository into **one Vercel project** and keep the project root set to the repository root (`.`). Do not set `client` or `server` as the Vercel root directory. The checked-in `vercel.json` configures the workspace install/build, publishes `client/dist`, and sends frontend routes to the Vite SPA entry point. The `api/[...path].js` catch-all function routes `/api/*` requests into the shared Express app.

The API uses the same Express app as local development. Vercel invokes it as a serverless function, while `npm run dev` and `npm start` continue to use the local listener.

Image uploads use short-lived, authenticated Cloudinary signatures and send image bytes directly from the browser to Cloudinary. The Cloudinary API secret stays on the server, and the existing 5 MB file validation remains in place without sending image bodies through Vercel Functions.

### Vercel project settings

| Setting | Value |
|---|---|
| Root Directory | `.` (repository root) |
| Framework Preset | Vite |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `client/dist` |
| Development Command | Leave unset; local development uses `npm run dev` |

### Environment variables and secrets

Add the variables from `.env.example` to Vercel's **Production** environment (and Preview too if you will test previews). Set them in Vercel project settings, not in frontend `VITE_*` variables:

- `DATABASE_URL` — Neon PostgreSQL connection string.
- `JWT_SECRET` — strong, unique signing secret.
- `CRON_SECRET` — strong random bearer secret used to authorize scheduled cleanup.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — the current application requires Razorpay Test Mode credentials.

Do not commit real credentials. Generate a cron secret locally with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the same `CRON_SECRET` value in the Vercel Production environment and in GitHub repository **Settings → Secrets and variables → Actions → Secrets**. Add a GitHub Actions repository variable named `VERCEL_APP_URL` whose value is the production base URL (for example, `https://your-project.vercel.app`, with no path).

### Reservation cleanup schedule

The checkout-expiration SQL helper remains part of checkout creation and is also exposed through the protected `/api/cron/cleanup-expired-reservations` endpoint. No in-memory timer runs in the Vercel function. The workflow at `.github/workflows/cleanup-expired-reservations.yml` calls this endpoint every five minutes and can also be run manually from GitHub Actions.

This keeps the cleanup schedule available on Vercel Hobby as well as Pro. GitHub scheduled workflows can be delayed during high load and only run from the repository's default branch; if tighter scheduling guarantees are required, use Vercel Cron on a plan that supports a five-minute schedule or another managed scheduler. The endpoint remains protected by `CRON_SECRET`.

### Database and production checks

1. Apply `server/database.sql` for a new database, or apply the migrations in order from `server/migrations/` to an existing Neon database.
2. Verify Neon permits connections from the deployed Vercel functions and use the database provider's recommended pooled connection string where appropriate.
3. Configure Cloudinary and Razorpay Test Mode credentials in Vercel. The current application rejects live Razorpay keys.
4. Deploy to Vercel and confirm the build completes from the repository root.
5. Test the homepage and refresh a nested client route directly; confirm static assets load and the SPA renders.
6. Test `https://<your-domain>/api/test-db`, registration/login, product loading, authenticated account routes, and the existing marketplace flows.
7. Test product, avatar, review, custom-order, and storefront image uploads with JPG, PNG, and WebP files up to the 5 MB limit.
8. In GitHub Actions, run **Clean expired checkout reservations** manually and confirm it succeeds. A request without the bearer secret should be rejected; do not put the secret in a URL or log it.
9. Test checkout with Razorpay Test Mode and verify orders, payment state, inventory reservations, expiration cleanup, refunds, reviews, and custom orders against the deployed database.

## Project commands

- `npm run dev` — start the client and API for local development
- `npm run build` — build the production storefront
- `npm start` — start the API and serve the production storefront
- `npm test` — run server tests
- `npm run lint` — lint the client
- `npm run setup-admin` — run the server's admin setup utility
