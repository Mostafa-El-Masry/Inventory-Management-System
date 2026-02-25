-- Production hardening: lock down self-profile mutations and product master writes.
do $$
begin
  if to_regclass('public.products') is null
     or to_regclass('public.profiles') is null then
    raise exception 'IMS base schema missing (public.products/public.profiles). Run migrations 001-008 on this project before 009.';
  end if;

  if to_regtype('public.role_type') is null then
    raise exception 'Type public.role_type is missing. Run migration 002 before 009.';
  end if;
end $$;

drop policy if exists products_write on public.products;
create policy products_write on public.products
for all using (
  public.current_role() = 'admin'::role_type
)
with check (
  public.current_role() = 'admin'::role_type
);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
for insert with check (
  id = auth.uid()
  and coalesce(lower(role::text), 'staff') = 'staff'
  and is_active = true
);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update using (
  false
)
with check (
  false
);
