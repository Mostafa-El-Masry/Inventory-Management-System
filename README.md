# Inventory Management System

Next.js + Supabase inventory application with:

- Multi-location stock
- Product master + barcode
- Integer quantity handling
- Batch/lot + expiry tracking
- FEFO posting for outbound movements
- Immutable transaction history + reversals
- Manager-approved transfers
- Low stock and expiry alerts
- Dashboard metrics + CSV export

## Tech Stack

- Next.js App Router (TypeScript strict)
- Supabase Auth + Postgres + RLS + RPC
- Tailwind CSS
- Zod validation
- Vitest tests

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Ensure `.env` has:
   - `NODE_ENV` (`development`, `test`, or `production`)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_ORIGIN_ALLOWLIST` (comma-separated exact trusted origins with protocol, e.g. `http://localhost:3000,https://your-project.vercel.app`)
   - `AUTH_DEV_RESET_FALLBACK_ENABLED` (`true` or `false`)
3. Start Supabase locally and apply SQL:
   ```bash
   supabase start
   supabase db reset
   ```
4. Start the app:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:3000`.

## Project Structure

- `app/(auth)` login flow
- `app/(dashboard)` inventory pages
- `app/api/**` full API surface
- `lib/**` auth, Supabase clients, validation, utilities
- `supabase/migrations/**` schema + RLS + RPC + cron
- `supabase/seed.sql` demo seed data

## Core API Endpoints

- `GET/POST/PATCH /api/locations`
- `POST /api/locations/[id]/archive`
- `POST /api/locations/[id]/activate`
- `GET/POST/PATCH /api/products`
- `POST /api/products/[id]/archive`
- `POST /api/products/[id]/activate`
- `GET /api/master/export?entity=locations|products|categories|subcategories|suppliers&include_inactive=true|false`
- `GET /api/master/import/template?entity=locations|products|categories|subcategories|suppliers`
- `POST /api/master/import?entity=locations|products|categories|subcategories|suppliers`
- `GET/POST /api/product-categories`
- `POST /api/product-categories/[id]/archive`
- `POST /api/product-categories/[id]/activate`
- `POST /api/product-categories/[id]/hard-delete`
- `GET/POST /api/product-subcategories`
- `POST /api/product-subcategories/[id]/archive`
- `POST /api/product-subcategories/[id]/activate`
- `POST /api/product-subcategories/[id]/hard-delete`
- `GET/POST/PATCH /api/products/[id]/policies`
- `GET /api/stock`
- `GET/POST /api/transactions`
- `POST /api/transactions/[id]/submit`
- `POST /api/transactions/[id]/post`
- `POST /api/transactions/[id]/reverse`
- `GET/POST /api/transfers`
- `POST /api/transfers/[id]/approve`
- `POST /api/transfers/[id]/dispatch`
- `POST /api/transfers/[id]/receive`
- `GET /api/alerts`
- `POST /api/alerts/[id]/ack`
- `GET /api/reports/dashboard`
- `GET /api/reports/export?entity=products|stock|transactions`
- `GET /api/auth/me`
- `POST /api/settings/clear-transactions`
- `POST /api/auth/set-password`
- `POST /api/admin/users`
- `POST /api/admin/users/[id]/disable`
- `POST /api/admin/users/[id]/enable`
- `POST /api/admin/users/[id]/invite-resend`

## Quality Checks

```bash
npm run lint
npm test
npm run build
```

`npm run build` now runs strict environment validation before Next.js build output. If env values are malformed or missing, the build exits early with explicit variable-level errors.

## Master CSV Export/Reimport

- Reimport is admin-only and non-destructive. Missing rows in file are not deleted.
- Reimport mode is strict key-based upsert:
  - `locations`: key `code`
  - `suppliers`: key `code`
  - `categories`: key `code` (2 digits)
  - `subcategories`: key `category_code + code` (2 + 3 digits)
  - `products`: key `sku`
- Product reimport requires valid existing taxonomy references (`category_code`, `subcategory_code`).
- Existing `/api/products/import` remains create-only bulk import.

CSV headers by entity:

- `locations`: `code,name,timezone,is_active`
- `suppliers`: `code,name,phone,email,is_active`
- `categories`: `code,name,is_active`
- `subcategories`: `category_code,code,name,is_active`
- `products`: `sku,name,barcode,unit,is_active,description,category_code,subcategory_code`

Recommended full restore order:

1. Categories
2. Subcategories
3. Locations
4. Suppliers
5. Products

## Deployment Checklist

- Set all required env vars in every environment (Production, Preview, Development):
  - `NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>`
  - `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`
  - `APP_ORIGIN_ALLOWLIST=https://<project>.vercel.app,https://<custom-domain>`
  - `AUTH_DEV_RESET_FALLBACK_ENABLED=false`
- Ensure each `APP_ORIGIN_ALLOWLIST` entry is an exact `http/https` origin (no wildcards, no paths/query/hash).
- Set `AUTH_DEV_RESET_FALLBACK_ENABLED=false` in production.
   - If `APP_ORIGIN_ALLOWLIST` is omitted on Vercel, the app falls back to `https://${VERCEL_URL}`.
