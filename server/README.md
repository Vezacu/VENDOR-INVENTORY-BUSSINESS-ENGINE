# VIBE server setup

Apply `database.sql` to a new database. For an existing database, apply the migrations in order:

1. `migrations/001_user_roles_and_single_admin.sql`
2. `migrations/002_product_categories_and_images.sql`
3. `migrations/003_customer_profiles_and_shop_pages.sql`
4. `migrations/004_single_seller_and_catalog.sql`
5. `migrations/005_razorpay_checkout.sql`
6. `migrations/006_order_tracking_and_refunds.sql`
7. `migrations/007_product_reviews_and_custom_orders.sql`
8. `migrations/008_custom_order_payment_items.sql`
9. `migrations/009_custom_order_mail_read_status.sql`
10. `migrations/010_customer_hidden_custom_orders.sql`
11. `migrations/011_customer_profile_images.sql`

The third migration also adds unique public shop slugs to existing seller shops. The fourth migration keeps the oldest seller account, moves products and order records from other seller shops into that seller's shop, and removes the additional seller accounts and shops. It then enforces the one-seller limit. Available, in-stock products remain visible in the public shop; hidden and out-of-stock products are not included in the customer catalog.

Set `DATABASE_URL` and `JWT_SECRET` before starting the server. To reset the existing admin password, set `ADMIN_PASSWORD` (at least 8 characters) in your local PowerShell session, then run `npm run setup-admin` from this directory. The command updates the one existing admin account and prints its login email; no existing email or password is needed. Optionally set `ADMIN_EMAIL` to change the login email and `ADMIN_NAME` to change the display name. The command will refuse to use an email already assigned to another account.

```powershell
$env:ADMIN_PASSWORD = Read-Host "New admin password"
try {
    npm run setup-admin
} finally {
    Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
```

To create the first admin account instead, also set `ADMIN_NAME` and `ADMIN_EMAIL` before running the command.

The admin can create one seller account. Customer accounts can be self-registered without a limit and can save delivery details for future orders.

Start the backend from this `server` directory with `npm start` (or use `npm run dev` while developing). The React client expects the API at `http://localhost:5000`.

## Razorpay test checkout

Apply `migrations/005_razorpay_checkout.sql` after the earlier migrations, then configure `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in the server's local `.env` using Razorpay **Test Mode** credentials. Use a key ID beginning with `rzp_test_`; the backend refuses live-mode key IDs. Keep `.env` local and never place the key secret in client configuration or source control. `.env.example` contains placeholders only.

The customer checkout creates an order through `POST /api/payment/create-order`, then verifies the returned Checkout signature and captured payment through `POST /api/payment/verify`. Product prices and stock are checked on the backend. Stock is reserved for 15 minutes while checkout is pending and released automatically when that session expires. A successful Test Mode payment is recorded as paid and the order moves to processing; Test Mode does not transfer funds to the seller. Razorpay Standard Checkout presents payment methods available to the account, including supported UPI options.

Apply `migrations/006_order_tracking_and_refunds.sql` after migration 005 to enable customer order history, seller order management, and refund requests. Customers can request a refund for a captured Razorpay payment; a seller approval submits a full refund to Razorpay. An approved request is not considered complete until Razorpay reports it as processed. If the provider response is uncertain, review it in the Razorpay dashboard before taking further action.

The seller dashboard and analytics page read from paid order records. Charts record sales on the purchase date and subtract full refunds on the date Razorpay confirms them as processed. Best-seller rankings include net catalog product line items only, excluding custom-request charges and fully refunded orders. Any presentation fixtures in a disposable test database must be marked `[DEMO]`, use no Razorpay transaction IDs or provider calls, and are identified in the analytics summary as simulated; they are not real payments. `GET /api/orders/analytics` is available to sellers and admins for those summaries.

Apply `migrations/007_product_reviews_and_custom_orders.sql` to enable delivered-product reviews with up to four images and customer/seller custom-order conversations with up to three idea images and seller quotes.

Apply `migrations/008_custom_order_payment_items.sql` to allow custom-order line items, which do not reference a catalog product, in existing databases.

Apply `migrations/009_custom_order_mail_read_status.sql` to track when customers have viewed seller replies in their custom-order inbox.

Apply `migrations/010_customer_hidden_custom_orders.sql` to let customers remove eligible messages from their inbox without deleting the seller’s custom-order record.

Apply `migrations/011_customer_profile_images.sql` to store customer profile images. Customers can view and update their profile through authenticated `GET /api/auth/profile` and `PATCH /api/auth/profile` requests. Profile pictures are uploaded through authenticated `POST /api/uploads/customer-avatar`; JPG, PNG, and WebP files up to 5 MB are stored in Cloudinary.
