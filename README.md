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
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
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
