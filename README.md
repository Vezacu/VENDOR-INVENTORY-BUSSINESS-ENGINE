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

## Deploy the complete project

Connect or upload this repository as **one project**, using the repository root as the deployment root. Do not deploy the `client` and `server` folders as separate services.

Configure these commands in the deployment platform:

| Setting | Command |
|---|---|
| Install | `npm install` |
| Build | `npm run build` |
| Start | `npm start` |

Set the environment variables from `.env.example` in the deployment platform. Apply the database schema/migrations to your PostgreSQL database before using the deployed app. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to Test Mode credentials unless you have explicitly prepared and verified a production payment configuration.

The build produces the storefront in `client/dist`. The Express server serves that build and handles the `/api` endpoints from the same origin. The server listens on the deployment platform's `PORT` environment variable.

## Project commands

- `npm run dev` — start the client and API for local development
- `npm run build` — build the production storefront
- `npm start` — start the API and serve the production storefront
- `npm test` — run server tests
- `npm run lint` — lint the client
- `npm run setup-admin` — run the server's admin setup utility
