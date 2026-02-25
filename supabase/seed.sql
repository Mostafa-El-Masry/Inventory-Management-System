do $$
begin
  if to_regclass('public.locations') is null
     or to_regclass('public.products') is null
     or to_regclass('public.inventory_batches') is null then
    raise exception 'Base schema missing. Run migrations 001 through 008 before running seed.sql.';
  end if;

  if to_regprocedure('public.rpc_refresh_alerts()') is null then
    raise exception 'Function public.rpc_refresh_alerts() is missing. Run migration 007 before seed.sql.';
  end if;
end $$;

-- Master locations
insert into public.locations (code, name, timezone, is_active)
values
  ('NYC-01', 'New York Warehouse', 'America/New_York', true),
  ('DAL-01', 'Dallas Distribution Center', 'America/Chicago', true),
  ('SFO-01', 'San Francisco Hub', 'America/Los_Angeles', true)
on conflict (code) do update set
  name = excluded.name,
  timezone = excluded.timezone,
  is_active = excluded.is_active;

-- Master products
insert into public.products (sku, barcode, name, description, unit, is_active)
values
  ('SKU-1001', '8901000000011', 'Paracetamol 500mg', 'Tablet strip', 'box', true),
  ('SKU-1002', '8901000000012', 'Vitamin C 1000mg', 'Effervescent', 'box', true),
  ('SKU-1003', '8901000000013', 'Disinfectant 1L', 'Liquid bottle', 'bottle', true)
on conflict (sku) do update set
  barcode = excluded.barcode,
  name = excluded.name,
  description = excluded.description,
  unit = excluded.unit,
  is_active = excluded.is_active;

-- Product reorder policies per location
insert into public.product_location_policies (product_id, location_id, min_qty, max_qty, reorder_qty)
select p.id, l.id,
  case p.sku when 'SKU-1003' then 20 else 50 end as min_qty,
  case p.sku when 'SKU-1003' then 150 else 300 end as max_qty,
  case p.sku when 'SKU-1003' then 60 else 120 end as reorder_qty
from public.products p
cross join public.locations l
on conflict (product_id, location_id) do update set
  min_qty = excluded.min_qty,
  max_qty = excluded.max_qty,
  reorder_qty = excluded.reorder_qty;

-- Batch stock samples
insert into public.inventory_batches (
  product_id,
  location_id,
  lot_number,
  expiry_date,
  received_at,
  qty_on_hand,
  unit_cost
)
select
  p.id,
  l.id,
  'LOT-' || p.sku || '-' || l.code,
  current_date + (case p.sku when 'SKU-1001' then 180 when 'SKU-1002' then 45 else 365 end),
  timezone('utc', now()) - interval '5 days',
  case
    when p.sku = 'SKU-1001' then 120
    when p.sku = 'SKU-1002' then 40
    else 85
  end,
  case
    when p.sku = 'SKU-1001' then 2.50
    when p.sku = 'SKU-1002' then 4.75
    else 6.10
  end
from public.products p
join public.locations l on l.code in ('NYC-01', 'DAL-01')
on conflict (product_id, location_id, lot_number, expiry_date) do update set
  qty_on_hand = excluded.qty_on_hand,
  unit_cost = excluded.unit_cost,
  updated_at = timezone('utc', now());

-- Map known auth users if they exist.
do $$
declare
  has_full_name boolean;
  has_name boolean;
  has_role boolean;
  has_is_active boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'full_name'
  ) into has_full_name;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'name'
  ) into has_name;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
  ) into has_role;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'is_active'
  ) into has_is_active;

  if not has_role or not has_is_active then
    raise notice 'Skipping profile seeding: public.profiles is missing role and/or is_active columns.';
  elsif has_full_name then
    insert into public.profiles (id, full_name, role, is_active)
    select id, 'System Admin', 'admin', true
    from auth.users
    where email = 'admin@ims.local'
    on conflict (id) do update set
      full_name = excluded.full_name,
      role = excluded.role,
      is_active = excluded.is_active;

    insert into public.profiles (id, full_name, role, is_active)
    select id, 'Operations Manager', 'manager', true
    from auth.users
    where email = 'manager@ims.local'
    on conflict (id) do update set
      full_name = excluded.full_name,
      role = excluded.role,
      is_active = excluded.is_active;

    insert into public.profiles (id, full_name, role, is_active)
    select id, 'Store Staff', 'staff', true
    from auth.users
    where email = 'staff@ims.local'
    on conflict (id) do update set
      full_name = excluded.full_name,
      role = excluded.role,
      is_active = excluded.is_active;
  elsif has_name then
    insert into public.profiles (id, name, role, is_active)
    select id, 'System Admin', 'admin', true
    from auth.users
    where email = 'admin@ims.local'
    on conflict (id) do update set
      name = excluded.name,
      role = excluded.role,
      is_active = excluded.is_active;

    insert into public.profiles (id, name, role, is_active)
    select id, 'Operations Manager', 'manager', true
    from auth.users
    where email = 'manager@ims.local'
    on conflict (id) do update set
      name = excluded.name,
      role = excluded.role,
      is_active = excluded.is_active;

    insert into public.profiles (id, name, role, is_active)
    select id, 'Store Staff', 'staff', true
    from auth.users
    where email = 'staff@ims.local'
    on conflict (id) do update set
      name = excluded.name,
      role = excluded.role,
      is_active = excluded.is_active;
  else
    insert into public.profiles (id, role, is_active)
    select id, 'admin', true
    from auth.users
    where email = 'admin@ims.local'
    on conflict (id) do update set
      role = excluded.role,
      is_active = excluded.is_active;

    insert into public.profiles (id, role, is_active)
    select id, 'manager', true
    from auth.users
    where email = 'manager@ims.local'
    on conflict (id) do update set
      role = excluded.role,
      is_active = excluded.is_active;

    insert into public.profiles (id, role, is_active)
    select id, 'staff', true
    from auth.users
    where email = 'staff@ims.local'
    on conflict (id) do update set
      role = excluded.role,
      is_active = excluded.is_active;
  end if;
end $$;

insert into public.user_location_access (user_id, location_id)
select u.id, l.id
from auth.users u
join public.locations l on l.code in ('NYC-01', 'DAL-01')
where u.email in ('manager@ims.local', 'staff@ims.local')
on conflict (user_id, location_id) do nothing;

-- Refresh low stock / expiry alerts after seed.
select public.rpc_refresh_alerts();
