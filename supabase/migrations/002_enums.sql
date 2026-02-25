do $$
begin
  if not exists (select 1 from pg_type where typname = 'role_type') then
    create type role_type as enum ('admin', 'manager', 'staff');
  end if;

  if not exists (select 1 from pg_type where typname = 'transaction_type') then
    create type transaction_type as enum (
      'RECEIPT',
      'ISSUE',
      'TRANSFER_OUT',
      'TRANSFER_IN',
      'ADJUSTMENT',
      'RETURN_IN',
      'RETURN_OUT',
      'CYCLE_COUNT',
      'REVERSAL'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'transaction_status') then
    create type transaction_status as enum (
      'DRAFT',
      'SUBMITTED',
      'POSTED',
      'REVERSED',
      'CANCELLED'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'transfer_status') then
    create type transfer_status as enum (
      'REQUESTED',
      'APPROVED',
      'DISPATCHED',
      'RECEIVED',
      'REJECTED',
      'CANCELLED'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'alert_type') then
    create type alert_type as enum ('LOW_STOCK', 'EXPIRY');
  end if;

  if not exists (select 1 from pg_type where typname = 'alert_severity') then
    create type alert_severity as enum ('INFO', 'WARN', 'CRITICAL');
  end if;

  if not exists (select 1 from pg_type where typname = 'alert_status') then
    create type alert_status as enum ('OPEN', 'ACKED', 'CLOSED');
  end if;

  if not exists (select 1 from pg_type where typname = 'ledger_direction') then
    create type ledger_direction as enum ('IN', 'OUT');
  end if;
end $$;
