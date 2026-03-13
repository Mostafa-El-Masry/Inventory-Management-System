# Supabase Setup

This folder contains the full database implementation for the Inventory Management System:

- `migrations/001_extensions.sql` to `migrations/010_audit_admin_entities.sql`
- `seed.sql` sample locations, products, policies, stock, and alert refresh
- `config.toml` local Supabase CLI configuration

## Prerequisites

1. Supabase CLI installed.
2. `.env` contains:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_ORIGIN_ALLOWLIST`
   - `AUTH_DEV_RESET_FALLBACK_ENABLED`

## Run Locally

1. Start local Supabase:
   ```bash
   supabase start
   ```
2. Apply migrations:
   ```bash
   supabase db reset
   ```
3. Seed sample data:
   `seed.sql` is executed by `supabase db reset` automatically.

## RPC Functions

The following SQL functions are used by API routes:

- `rpc_post_transaction(p_transaction_id uuid)`
- `rpc_reverse_transaction(p_transaction_id uuid, p_reason text)`
- `rpc_dispatch_transfer(p_transfer_id uuid)`
- `rpc_receive_transfer(p_transfer_id uuid)`
- `rpc_clear_transaction_data()`
- `rpc_refresh_alerts()`

## Notes

- Quantities are integer-only.
- Transaction history is immutable once posted.
- Corrections are done through reversal entries.
- FEFO batch consumption is enforced during outbound posting.
- Transfer receive requires full match with dispatched quantity in v1.
