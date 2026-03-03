-- Product taxonomy + SKU scheme (CC-SSS-NNNN)
-- Existing products keep legacy SKU and nullable category/subcategory.

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{2}$'),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.product_categories(id) on delete restrict,
  code text not null check (code ~ '^[0-9]{3}$'),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (category_id, code)
);

create unique index if not exists uq_product_categories_name_norm
  on public.product_categories (lower(btrim(name)));

create unique index if not exists uq_product_subcategories_name_norm
  on public.product_subcategories (category_id, lower(btrim(name)));

create table if not exists public.product_sku_counters (
  subcategory_id uuid primary key references public.product_subcategories(id) on delete cascade,
  last_value integer not null default -1 check (last_value >= -1),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.products
  add column if not exists category_id uuid references public.product_categories(id) on delete restrict;

alter table public.products
  add column if not exists subcategory_id uuid references public.product_subcategories(id) on delete restrict;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_category_subcategory_pair_chk'
  ) then
    alter table public.products
      add constraint products_category_subcategory_pair_chk
      check (
        (category_id is null and subcategory_id is null)
        or (category_id is not null and subcategory_id is not null)
      );
  end if;
end $$;

create or replace function public.trg_products_validate_taxonomy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_category_id uuid;
begin
  if new.category_id is null and new.subcategory_id is null then
    return new;
  end if;

  if new.category_id is null or new.subcategory_id is null then
    raise exception 'Both category_id and subcategory_id are required together.';
  end if;

  select s.category_id
  into v_category_id
  from public.product_subcategories s
  where s.id = new.subcategory_id;

  if v_category_id is null then
    raise exception 'Invalid product subcategory id.';
  end if;

  if v_category_id <> new.category_id then
    raise exception 'Product subcategory does not belong to selected category.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_validate_taxonomy on public.products;
create trigger trg_products_validate_taxonomy
before insert or update of category_id, subcategory_id
on public.products
for each row
execute procedure public.trg_products_validate_taxonomy();

create or replace function public.rpc_next_product_sku(
  p_category_id uuid,
  p_subcategory_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_code text;
  v_subcategory_code text;
  v_next integer;
begin
  select c.code, s.code
  into v_category_code, v_subcategory_code
  from public.product_subcategories s
  join public.product_categories c on c.id = s.category_id
  where c.id = p_category_id
    and s.id = p_subcategory_id
    and c.is_active
    and s.is_active;

  if v_category_code is null or v_subcategory_code is null then
    raise exception 'Invalid category/subcategory combination.'
      using errcode = 'P0001';
  end if;

  insert into public.product_sku_counters (subcategory_id, last_value)
  values (p_subcategory_id, -1)
  on conflict (subcategory_id) do nothing;

  update public.product_sku_counters
  set
    last_value = last_value + 1,
    updated_at = timezone('utc', now())
  where subcategory_id = p_subcategory_id
  returning last_value into v_next;

  if v_next is null then
    raise exception 'Failed to allocate SKU sequence.'
      using errcode = 'P0001';
  end if;

  if v_next > 9999 then
    update public.product_sku_counters
    set
      last_value = 9999,
      updated_at = timezone('utc', now())
    where subcategory_id = p_subcategory_id;

    raise exception 'SKU sequence exhausted for this subcategory.'
      using errcode = 'P0001';
  end if;

  return v_category_code || '-' || v_subcategory_code || '-' || lpad(v_next::text, 4, '0');
end;
$$;

grant execute on function public.rpc_next_product_sku(uuid, uuid) to authenticated;

alter table public.product_categories enable row level security;
alter table public.product_subcategories enable row level security;
alter table public.product_sku_counters enable row level security;

drop policy if exists product_categories_select on public.product_categories;
create policy product_categories_select on public.product_categories
for select using (
  auth.role() = 'authenticated'
);

drop policy if exists product_categories_write on public.product_categories;
create policy product_categories_write on public.product_categories
for all using (
  public.is_admin()
)
with check (
  public.is_admin()
);

drop policy if exists product_subcategories_select on public.product_subcategories;
create policy product_subcategories_select on public.product_subcategories
for select using (
  auth.role() = 'authenticated'
);

drop policy if exists product_subcategories_write on public.product_subcategories;
create policy product_subcategories_write on public.product_subcategories
for all using (
  public.is_admin()
)
with check (
  public.is_admin()
);

drop policy if exists product_sku_counters_no_access on public.product_sku_counters;
create policy product_sku_counters_no_access on public.product_sku_counters
for all using (false)
with check (false);
