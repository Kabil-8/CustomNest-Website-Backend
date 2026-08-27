# TheCustomNest — Backend API

Node.js + Express + MongoDB REST API for TheCustomNest. Implements real authentication, role-based authorization, and server-side price/stock integrity for checkout.

## Setup

```bash
cp .env.example .env
# edit .env — set MONGO_URI, JWT_SECRET, COOKIE_SECRET, ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD
npm install
npm run seed   # creates the first admin user + loads the product catalog
npm run dev    # starts on http://localhost:5000
```

Requires a MongoDB instance (local `mongod`, Docker, or MongoDB Atlas).

## Security notes

- Passwords are hashed with **bcrypt** (12 rounds) — plaintext passwords are never stored or logged.
- Auth uses a **JWT stored in an httpOnly cookie** (`tcn_token`), so it isn't accessible to client-side JS (mitigates XSS token theft). A Bearer-token fallback is also supported for non-browser clients.
- **Admin sign-in is a separate endpoint** (`POST /api/auth/admin/login`) from customer login, and only succeeds against users with `role: 'admin'`. Admin accounts are never created through public registration — only via `npm run seed` or by another admin.
- All `/admin/*`-equivalent routes (`requireRole('admin')`) re-check the role **server-side** on every request. Frontend route guards are UX only, not a security boundary.
- Order totals are **recomputed from the database** on the server during checkout — client-supplied prices are never trusted.
- Input is validated with `zod` on every mutating route.
- `express-mongo-sanitize` strips NoSQL-injection payloads; `helmet` sets security headers; CORS is locked to `CLIENT_ORIGIN`.
- Rate limiting: 20 req/15min on auth endpoints, 300 req/15min on the general API.
- File uploads (custom-order reference images) are limited to JPEG/PNG/WEBP and 5MB by default, validated by MIME type.
- No secrets are ever sent to the frontend. Payment provider keys (`PAYMENT_PROVIDER_KEY/SECRET`) are placeholders for you to wire up server-side only.

## API overview

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create a customer account |
| POST | `/api/auth/login` | — | Customer sign in |
| POST | `/api/auth/admin/login` | — | Admin sign in (separate from customer) |
| POST | `/api/auth/logout` | — | Clear session cookie |
| GET | `/api/auth/me` | ✅ | Current user |
| PATCH | `/api/auth/me` | ✅ | Update name/phone |
| GET | `/api/products` | — | List products (query: `q, category, collection, maxPrice, customizable, sort, page, limit`) |
| GET | `/api/products/categories` | — | List categories |
| GET | `/api/products/:slug` | — | Product detail |
| POST/PATCH/DELETE | `/api/products/:id` | admin | Manage catalog |
| POST | `/api/orders` | ✅ | Create order (server recomputes totals + stock) |
| GET | `/api/orders/mine` | ✅ | My orders |
| GET | `/api/orders/mine/:id` | ✅ | My order detail |
| GET | `/api/orders` | admin | All orders |
| PATCH | `/api/orders/:id/status` | admin | Update order status |
| GET/POST/DELETE | `/api/addresses` | ✅ | Manage saved addresses |
| POST | `/api/custom-orders` | optional | Submit a custom request (with optional image upload) |
| GET | `/api/custom-orders` | admin | List custom requests |
| PATCH | `/api/custom-orders/:id/status` | admin | Update request status |
| GET/POST | `/api/wishlist` | ✅ | View / toggle wishlist |
| GET/POST/PATCH/DELETE | `/api/cart` | ✅ | Server-persisted cart |
| GET/POST | `/api/reviews/:productId` | mixed | View / submit reviews |
| DELETE | `/api/reviews/:id` | admin | Moderate reviews |
| GET | `/api/admin/dashboard` | admin | Overview stats |
| GET | `/api/admin/customers` | admin | Customer list |

## Project structure

```
src/
  config/db.js          Mongo connection
  models/                Mongoose schemas (User, Product, Category, Order, Address, Cart, Wishlist, Review, CustomOrderRequest)
  middleware/            auth (JWT), RBAC, rate limiting, upload validation, error handling
  controllers/            Business logic per resource
  routes/                 Express routers, wired in server.js
  utils/seed.js           Seeds admin user + product catalog from seedData.json
```

## Note on product images

`seedData.json` references image paths like `/images/products/...` matching the frontend's `public/images` folder. For a real deployment, host these images on a CDN or object storage (S3, Cloudinary, etc.) and update the seed data / product `images` field accordingly — serving them from the frontend's static folder is fine for demos but not recommended for production.
