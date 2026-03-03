-- Enforce active-user checks in role helpers and key RLS policies.
do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is missing. Run migrations 001-011 before 012.';
  end if;

  if to_regclass('public.user_location_access') is null then
    raise exception 'public.user_location_access is missing. Run migration 003 (core tables) before 012.';
  end if;

  if to_regtype('public.role_type') is null then
    raise exception 'public.role_type is missing. Run migration 002 before 012.';
  end if;
end $$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
  );
$$;

create or replace function public.current_role()
returns role_type
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when public.is_active_user() then
        coalesce(
          (
            select
              case lower(coalesce(p.role::text, 'staff'))
                when 'admin' then 'admin'::role_type
                when 'manager' then 'manager'::role_type
                when 'staff' then 'staff'::role_type
                else 'staff'::role_type
              end
            from public.profiles p
            where p.id = auth.uid()
          ),
          'staff'::role_type
        )
      else null
    end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'admin'::role_type, false);
$$;

create or replace function public.has_location_access(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_active_user()
    and (
      public.is_admin()
      or exists (
        select 1
        from public.user_location_access ula
        where ula.user_id = auth.uid()
          and ula.location_id = p_location_id
      )
    );
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select using (
  id = auth.uid()
  and public.is_active_user()
);

drop policy if exists products_select on public.products;
create policy products_select on public.products
for select using (
  auth.role() = 'authenticated'
  and public.is_active_user()
);
