do $$
begin
  if to_regclass('public.locations') is null
     or to_regclass('public.inventory_transactions') is null
     or to_regclass('public.transfers') is null
     or to_regclass('public.user_location_access') is null
     or to_regclass('public.supplier_documents') is null then
    raise exception 'Required tables are missing. Run migrations 001 through 020 before 021.';
  end if;
end $$;

create temporary table if not exists tmp_location_access_users (
  user_id uuid primary key
) on commit drop;

insert into tmp_location_access_users (user_id)
select distinct user_id
from public.user_location_access
on conflict (user_id) do nothing;

-- Bypass transaction and transfer immutability guards while we hard-reset location data.
do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_enforce_transfer_line_edit_on_requested'
      and tgrelid = 'public.transfer_lines'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.transfer_lines disable trigger trg_enforce_transfer_line_edit_on_requested';
  end if;

  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_prevent_posted_transaction_mutation'
      and tgrelid = 'public.inventory_transactions'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.inventory_transactions disable trigger trg_prevent_posted_transaction_mutation';
  end if;
end $$;

select set_config('ims.bypass_draft_line_guard', 'on', true);

-- Hard-delete all existing location-linked data so old demo locations are fully removed.
delete from public.supplier_documents;
delete from public.transfers;
delete from public.stock_ledger;
delete from public.inventory_transactions;
delete from public.locations;

-- Re-enable business-guard triggers after cleanup.
do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_prevent_posted_transaction_mutation'
      and tgrelid = 'public.inventory_transactions'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.inventory_transactions enable trigger trg_prevent_posted_transaction_mutation';
  end if;

  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_enforce_transfer_line_edit_on_requested'
      and tgrelid = 'public.transfer_lines'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.transfer_lines enable trigger trg_enforce_transfer_line_edit_on_requested';
  end if;
end $$;

insert into public.locations (code, name, timezone, is_active)
values
  ('LON-01', 'London', 'Europe/London', true),
  ('CAI-01', 'Cairo', 'Africa/Cairo', true),
  ('KUW-01', 'Kuwait City', 'Asia/Kuwait', true),
  ('RIY-01', 'Riyadh', 'Asia/Riyadh', true),
  ('DOH-01', 'Doha', 'Asia/Qatar', true),
  ('MAN-01', 'Manama', 'Asia/Bahrain', true),
  ('MUS-01', 'Muscat', 'Asia/Muscat', true),
  ('ABU-01', 'Abu Dhabi', 'Asia/Dubai', true),
  ('AMM-01', 'Amman', 'Asia/Amman', true),
  ('BEI-01', 'Beirut', 'Asia/Beirut', true)
on conflict (code) do update set
  name = excluded.name,
  timezone = excluded.timezone,
  is_active = excluded.is_active;

insert into public.user_location_access (user_id, location_id)
select u.user_id, l.id
from tmp_location_access_users u
cross join public.locations l
on conflict (user_id, location_id) do nothing;
