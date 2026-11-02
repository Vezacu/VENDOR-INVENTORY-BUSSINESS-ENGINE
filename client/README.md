# VIBE

A handmade marketplace frontend for shoppers and independent makers.

## Run locally

```sh
npm install
npm run dev
```

The seller login screen calls the API at `http://localhost:5000/api/auth/`.
Seller accounts are invitation-only: the admin creates them from
`/seller/accounts`. Start the server separately to use authentication and image
uploads.
The dashboard account menu shows the signed-in email, lets you switch between
accounts used on this device, and can start another sign-in. Signed-in sessions
are kept in browser storage for switching; passwords are never stored. Logging
out removes that account's remembered session.

```sh
cd ../server
npm install
node server.js
```

Product photos selected in the seller workspace are uploaded to Cloudinary
through the authenticated backend endpoint. The browser receives secure image
URLs. Saving a product writes its details and Cloudinary image URLs to Neon.
Seller products are scoped to the seller's shop; admins choose a shop when
creating a product.
The product category and image URL columns are added by
`server/migrations/002_product_categories_and_images.sql`.

For server environment variables, copy `server/.env.example` to `server/.env`
and set the Neon connection string, a long random `JWT_SECRET`, and your
Cloudinary credentials. The server `.env` file is ignored by Git.

## Pages

- Marketplace: `/`, `/shop`, `/product/:productId`, `/shops/:shopId`, `/custom-order`
- Buyer: `/cart`, `/checkout`, `/confirmation`, `/tracking`
- Seller account: `/seller/register`, `/seller/login`
- Seller workspace: `/seller/dashboard`, `/seller/shop-settings`,
  `/seller/products`, `/seller/products/new`, `/seller/products/edit`,
  `/seller/inventory`, `/seller/orders`, `/seller/order-details`,
  `/seller/custom-orders`, `/seller/custom-order-details`,
  `/seller/reviews`, `/seller/analytics`, `/seller/account`

## Demo behavior

The catalog and seller workspace use sample content. The cart, theme, and demo
orders are stored in the browser; checkout does not take payment. Custom-order
requests and seller workspace edits are frontend demonstrations and are not
saved to the server.

## Checks

```sh
npm run lint
npm run build
```
