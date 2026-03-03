-- Enforce normalized uniqueness for products (trim + case-insensitive).
do $$
declare
  duplicate_name text;
  duplicate_sku text;
begin
  if to_regclass('public.products') is null then
    raise exception 'public.products is missing. Run migrations 001-014 before 015.';
  end if;

  select lower(btrim(name))
  into duplicate_name
  from public.products
  group by lower(btrim(name))
  having count(*) > 1
  limit 1;

  if duplicate_name is not null then
    raise exception
      'Cannot apply product normalized uniqueness: duplicate normalized name found (%). Clean data first.',
      duplicate_name;
  end if;

  select upper(btrim(sku))
  into duplicate_sku
  from public.products
  group by upper(btrim(sku))
  having count(*) > 1
  limit 1;

  if duplicate_sku is not null then
    raise exception
      'Cannot apply product normalized uniqueness: duplicate normalized SKU found (%). Clean data first.',
      duplicate_sku;
  end if;
end $$;

create unique index if not exists uq_products_name_norm
  on public.products (lower(btrim(name)));

create unique index if not exists uq_products_sku_norm
  on public.products (upper(btrim(sku)));
