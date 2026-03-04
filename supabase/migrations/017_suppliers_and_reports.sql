do $$
begin
  if not exists (select 1 from pg_type where typname = 'supplier_document_type') then
    create type supplier_document_type as enum ('INVOICE', 'CREDIT_NOTE');
  end if;

  if not exists (select 1 from pg_type where typname = 'supplier_document_status') then
    create type supplier_document_status as enum ('OPEN', 'VOID');
  end if;
end $$;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.supplier_documents (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  location_id uuid not null references public.locations(id),
  source_transaction_id uuid unique references public.inventory_transactions(id),
  document_type supplier_document_type not null,
  document_number text not null,
  document_date date not null,
  currency text not null default 'KWD',
  gross_amount numeric(14, 2) not null default 0,
  status supplier_document_status not null default 'OPEN',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (supplier_id, document_type, document_number)
);

create table if not exists public.supplier_document_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_document_id uuid not null references public.supplier_documents(id) on delete cascade,
  payment_number text not null unique,
  payment_date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.inventory_transactions
  add column if not exists supplier_id uuid references public.suppliers(id),
  add column if not exists supplier_invoice_number text,
  add column if not exists supplier_invoice_date date;

create index if not exists idx_supplier_documents_document_date
  on public.supplier_documents (document_date desc);

create index if not exists idx_supplier_documents_supplier_date
  on public.supplier_documents (supplier_id, document_date desc);

create index if not exists idx_supplier_documents_location_date
  on public.supplier_documents (location_id, document_date desc);

create index if not exists idx_supplier_document_payments_document_date
  on public.supplier_document_payments (supplier_document_id, payment_date desc);

create index if not exists idx_inventory_transactions_supplier_invoice_date
  on public.inventory_transactions (supplier_id, supplier_invoice_date desc)
  where supplier_id is not null;

alter table public.suppliers enable row level security;
alter table public.supplier_documents enable row level security;
alter table public.supplier_document_payments enable row level security;

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
for select using (
  auth.role() = 'authenticated'
);

drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers
for all using (
  public.is_admin()
)
with check (
  public.is_admin()
);

drop policy if exists supplier_documents_select on public.supplier_documents;
create policy supplier_documents_select on public.supplier_documents
for select using (
  public.is_admin() or public.has_location_access(location_id)
);

drop policy if exists supplier_documents_write on public.supplier_documents;
create policy supplier_documents_write on public.supplier_documents
for all using (
  public.current_role() in ('admin'::role_type, 'manager'::role_type)
  and public.has_location_access(location_id)
)
with check (
  public.current_role() in ('admin'::role_type, 'manager'::role_type)
  and public.has_location_access(location_id)
);

drop policy if exists supplier_document_payments_select on public.supplier_document_payments;
create policy supplier_document_payments_select on public.supplier_document_payments
for select using (
  exists (
    select 1
    from public.supplier_documents d
    where d.id = supplier_document_payments.supplier_document_id
      and (public.is_admin() or public.has_location_access(d.location_id))
  )
);

drop policy if exists supplier_document_payments_write on public.supplier_document_payments;
create policy supplier_document_payments_write on public.supplier_document_payments
for all using (
  public.current_role() in ('admin'::role_type, 'manager'::role_type)
  and exists (
    select 1
    from public.supplier_documents d
    where d.id = supplier_document_payments.supplier_document_id
      and public.has_location_access(d.location_id)
  )
)
with check (
  public.current_role() in ('admin'::role_type, 'manager'::role_type)
  and exists (
    select 1
    from public.supplier_documents d
    where d.id = supplier_document_payments.supplier_document_id
      and public.has_location_access(d.location_id)
  )
);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_suppliers_set_updated_at on public.suppliers;
    create trigger trg_suppliers_set_updated_at
    before update on public.suppliers
    for each row execute procedure public.set_updated_at();

    drop trigger if exists trg_supplier_documents_set_updated_at on public.supplier_documents;
    create trigger trg_supplier_documents_set_updated_at
    before update on public.supplier_documents
    for each row execute procedure public.set_updated_at();

    drop trigger if exists trg_supplier_document_payments_set_updated_at on public.supplier_document_payments;
    create trigger trg_supplier_document_payments_set_updated_at
    before update on public.supplier_document_payments
    for each row execute procedure public.set_updated_at();
  end if;
end $$;
