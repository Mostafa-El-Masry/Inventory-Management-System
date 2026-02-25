create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  tx_number text not null unique default ('TX-' || to_char(timezone('utc', now()), 'YYYYMMDDHH24MISSMS')),
  type transaction_type not null,
  status transaction_status not null default 'DRAFT',
  source_location_id uuid references public.locations(id),
  destination_location_id uuid references public.locations(id),
  reference_type text,
  reference_id uuid,
  notes text,
  reversal_reason text,
  created_by uuid not null references public.profiles(id),
  submitted_by uuid references public.profiles(id),
  posted_by uuid references public.profiles(id),
  reversed_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  submitted_at timestamptz,
  posted_at timestamptz,
  reversed_at timestamptz,
  check (
    (
      type in ('RECEIPT', 'RETURN_IN', 'TRANSFER_IN') and destination_location_id is not null
    ) or (
      type in ('ISSUE', 'RETURN_OUT', 'TRANSFER_OUT') and source_location_id is not null
    ) or (
      type in ('ADJUSTMENT', 'CYCLE_COUNT', 'REVERSAL')
    )
  ),
  check (
    source_location_id is null
    or destination_location_id is null
    or source_location_id <> destination_location_id
  )
);

create table if not exists public.inventory_transaction_lines (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.inventory_transactions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty integer not null check (qty > 0),
  unit_cost numeric(14, 2),
  lot_number text,
  expiry_date date,
  reason_code text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  lot_number text,
  expiry_date date,
  received_at timestamptz not null default timezone('utc', now()),
  qty_on_hand integer not null default 0 check (qty_on_hand >= 0),
  unit_cost numeric(14, 2) check (unit_cost is null or unit_cost >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (product_id, location_id, lot_number, expiry_date)
);

create table if not exists public.stock_ledger (
  id uuid primary key default gen_random_uuid(),
  transaction_line_id uuid not null references public.inventory_transaction_lines(id) on delete cascade,
  product_id uuid not null references public.products(id),
  location_id uuid not null references public.locations(id),
  batch_id uuid not null references public.inventory_batches(id),
  direction ledger_direction not null,
  qty integer not null check (qty > 0),
  occurred_at timestamptz not null default timezone('utc', now()),
  created_by uuid not null references public.profiles(id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'alerts_batch_id_fkey'
  ) then
    alter table public.alerts
      add constraint alerts_batch_id_fkey
      foreign key (batch_id)
      references public.inventory_batches(id)
      on delete set null;
  end if;
end $$;
