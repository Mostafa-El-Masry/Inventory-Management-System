create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role role_type not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if to_regclass('public.profiles') is not null then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'full_name'
    ) then
      alter table public.profiles
        add column full_name text not null default '';
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'role'
    ) then
      alter table public.profiles
        add column role role_type not null default 'staff';
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'is_active'
    ) then
      alter table public.profiles
        add column is_active boolean not null default true;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'created_at'
    ) then
      alter table public.profiles
        add column created_at timestamptz not null default timezone('utc', now());
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'updated_at'
    ) then
      alter table public.profiles
        add column updated_at timestamptz not null default timezone('utc', now());
    end if;
  end if;
end $$;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_location_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, location_id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  barcode text unique,
  name text not null,
  description text,
  unit text not null default 'unit',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_location_policies (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  min_qty integer not null default 0 check (min_qty >= 0),
  max_qty integer not null default 0 check (max_qty >= 0),
  reorder_qty integer not null default 0 check (reorder_qty >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (product_id, location_id),
  check (max_qty >= min_qty)
);

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_number text not null unique,
  from_location_id uuid not null references public.locations(id),
  to_location_id uuid not null references public.locations(id),
  status transfer_status not null default 'REQUESTED',
  notes text,
  requested_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  dispatched_by uuid references public.profiles(id),
  received_by uuid references public.profiles(id),
  requested_at timestamptz not null default timezone('utc', now()),
  approved_at timestamptz,
  dispatched_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (from_location_id <> to_location_id)
);

create table if not exists public.transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  product_id uuid not null references public.products(id),
  requested_qty integer not null check (requested_qty > 0),
  dispatched_qty integer not null default 0 check (dispatched_qty >= 0),
  received_qty integer not null default 0 check (received_qty >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (transfer_id, product_id)
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  type alert_type not null,
  severity alert_severity not null default 'INFO',
  product_id uuid references public.products(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  batch_id uuid,
  message text not null,
  status alert_status not null default 'OPEN',
  due_date date,
  acked_by uuid references public.profiles(id),
  acked_at timestamptz,
  ack_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id),
  entity text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
