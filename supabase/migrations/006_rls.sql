create or replace function public.current_role()
returns role_type
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
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
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'admin'::role_type;
$$;

create or replace function public.has_location_access(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.user_location_access ula
      where ula.user_id = auth.uid()
        and ula.location_id = p_location_id
    );
$$;

alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.user_location_access enable row level security;
alter table public.products enable row level security;
alter table public.product_location_policies enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.inventory_transaction_lines enable row level security;
alter table public.stock_ledger enable row level security;
alter table public.transfers enable row level security;
alter table public.transfer_lines enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select using (
  id = auth.uid()
);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update using (
  id = auth.uid()
)
with check (
  id = auth.uid()
);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
for insert with check (
  id = auth.uid()
);

drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
for select using (
  public.has_location_access(id)
);

drop policy if exists locations_write on public.locations;
create policy locations_write on public.locations
for all using (
  public.is_admin()
)
with check (
  public.is_admin()
);

drop policy if exists user_location_access_select on public.user_location_access;
create policy user_location_access_select on public.user_location_access
for select using (
  user_id = auth.uid() or public.is_admin()
);

drop policy if exists user_location_access_write on public.user_location_access;
create policy user_location_access_write on public.user_location_access
for all using (
  public.is_admin()
)
with check (
  public.is_admin()
);

drop policy if exists products_select on public.products;
create policy products_select on public.products
for select using (
  auth.role() = 'authenticated'
);

drop policy if exists products_write on public.products;
create policy products_write on public.products
for all using (
  public.current_role() in ('admin'::role_type, 'manager'::role_type)
)
with check (
  public.current_role() in ('admin'::role_type, 'manager'::role_type)
);

drop policy if exists policies_select on public.product_location_policies;
create policy policies_select on public.product_location_policies
for select using (
  public.has_location_access(location_id)
);

drop policy if exists policies_write on public.product_location_policies;
create policy policies_write on public.product_location_policies
for all using (
  public.current_role() in ('admin'::role_type, 'manager'::role_type)
  and public.has_location_access(location_id)
)
with check (
  public.current_role() in ('admin'::role_type, 'manager'::role_type)
  and public.has_location_access(location_id)
);

drop policy if exists inventory_batches_select on public.inventory_batches;
create policy inventory_batches_select on public.inventory_batches
for select using (
  public.has_location_access(location_id)
);

drop policy if exists inventory_batches_write on public.inventory_batches;
create policy inventory_batches_write on public.inventory_batches
for all using (
  public.is_admin()
)
with check (
  public.is_admin()
);

drop policy if exists inventory_transactions_select on public.inventory_transactions;
create policy inventory_transactions_select on public.inventory_transactions
for select using (
  public.is_admin()
  or public.has_location_access(source_location_id)
  or public.has_location_access(destination_location_id)
);

drop policy if exists inventory_transactions_insert on public.inventory_transactions;
create policy inventory_transactions_insert on public.inventory_transactions
for insert with check (
  public.current_role() in ('admin'::role_type, 'manager'::role_type, 'staff'::role_type)
  and (
    source_location_id is null or public.has_location_access(source_location_id)
  )
  and (
    destination_location_id is null or public.has_location_access(destination_location_id)
  )
);

drop policy if exists inventory_transactions_update on public.inventory_transactions;
create policy inventory_transactions_update on public.inventory_transactions
for update using (
  public.current_role() in ('admin'::role_type, 'manager'::role_type, 'staff'::role_type)
  and (
    source_location_id is null or public.has_location_access(source_location_id)
  )
  and (
    destination_location_id is null or public.has_location_access(destination_location_id)
  )
)
with check (
  public.current_role() in ('admin'::role_type, 'manager'::role_type, 'staff'::role_type)
  and (
    source_location_id is null or public.has_location_access(source_location_id)
  )
  and (
    destination_location_id is null or public.has_location_access(destination_location_id)
  )
);

drop policy if exists inventory_lines_select on public.inventory_transaction_lines;
create policy inventory_lines_select on public.inventory_transaction_lines
for select using (
  exists (
    select 1
    from public.inventory_transactions t
    where t.id = inventory_transaction_lines.transaction_id
      and (
        public.is_admin()
        or public.has_location_access(t.source_location_id)
        or public.has_location_access(t.destination_location_id)
      )
  )
);

drop policy if exists inventory_lines_write on public.inventory_transaction_lines;
create policy inventory_lines_write on public.inventory_transaction_lines
for all using (
  exists (
    select 1
    from public.inventory_transactions t
    where t.id = inventory_transaction_lines.transaction_id
      and t.status = 'DRAFT'
      and (
        t.created_by = auth.uid()
        or public.current_role() in ('admin'::role_type, 'manager'::role_type)
      )
  )
)
with check (
  exists (
    select 1
    from public.inventory_transactions t
    where t.id = inventory_transaction_lines.transaction_id
      and t.status = 'DRAFT'
      and (
        t.created_by = auth.uid()
        or public.current_role() in ('admin'::role_type, 'manager'::role_type)
      )
  )
);

drop policy if exists stock_ledger_select on public.stock_ledger;
create policy stock_ledger_select on public.stock_ledger
for select using (
  public.has_location_access(location_id)
);

drop policy if exists stock_ledger_write on public.stock_ledger;
create policy stock_ledger_write on public.stock_ledger
for all using (
  false
)
with check (
  false
);

drop policy if exists transfers_select on public.transfers;
create policy transfers_select on public.transfers
for select using (
  public.is_admin()
  or public.has_location_access(from_location_id)
  or public.has_location_access(to_location_id)
);

drop policy if exists transfers_insert on public.transfers;
create policy transfers_insert on public.transfers
for insert with check (
  public.current_role() in ('admin'::role_type, 'manager'::role_type, 'staff'::role_type)
  and public.has_location_access(from_location_id)
  and public.has_location_access(to_location_id)
);

drop policy if exists transfers_update on public.transfers;
create policy transfers_update on public.transfers
for update using (
  public.current_role() in ('admin'::role_type, 'manager'::role_type)
  and public.has_location_access(from_location_id)
  and public.has_location_access(to_location_id)
)
with check (
  public.current_role() in ('admin'::role_type, 'manager'::role_type)
  and public.has_location_access(from_location_id)
  and public.has_location_access(to_location_id)
);

drop policy if exists transfer_lines_select on public.transfer_lines;
create policy transfer_lines_select on public.transfer_lines
for select using (
  exists (
    select 1
    from public.transfers t
    where t.id = transfer_lines.transfer_id
      and (
        public.is_admin()
        or public.has_location_access(t.from_location_id)
        or public.has_location_access(t.to_location_id)
      )
  )
);

drop policy if exists transfer_lines_write on public.transfer_lines;
create policy transfer_lines_write on public.transfer_lines
for all using (
  exists (
    select 1
    from public.transfers t
    where t.id = transfer_lines.transfer_id
      and t.status = 'REQUESTED'
      and (
        t.requested_by = auth.uid()
        or public.current_role() in ('admin'::role_type, 'manager'::role_type)
      )
  )
)
with check (
  exists (
    select 1
    from public.transfers t
    where t.id = transfer_lines.transfer_id
      and t.status = 'REQUESTED'
      and (
        t.requested_by = auth.uid()
        or public.current_role() in ('admin'::role_type, 'manager'::role_type)
      )
  )
);

drop policy if exists alerts_select on public.alerts;
create policy alerts_select on public.alerts
for select using (
  public.is_admin()
  or location_id is null
  or public.has_location_access(location_id)
);

drop policy if exists alerts_update on public.alerts;
create policy alerts_update on public.alerts
for update using (
  public.current_role() in ('admin'::role_type, 'manager'::role_type, 'staff'::role_type)
  and (
    location_id is null
    or public.has_location_access(location_id)
  )
)
with check (
  public.current_role() in ('admin'::role_type, 'manager'::role_type, 'staff'::role_type)
  and (
    location_id is null
    or public.has_location_access(location_id)
  )
);

drop policy if exists alerts_insert on public.alerts;
create policy alerts_insert on public.alerts
for insert with check (
  public.is_admin()
);

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
for select using (
  public.is_admin()
);

drop policy if exists audit_log_write on public.audit_log;
create policy audit_log_write on public.audit_log
for all using (
  false
)
with check (
  false
);
