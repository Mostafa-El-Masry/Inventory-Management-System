create index if not exists idx_user_location_access_user_id
  on public.user_location_access (user_id);

create index if not exists idx_user_location_access_location_id
  on public.user_location_access (location_id);

create index if not exists idx_product_location_policies_location
  on public.product_location_policies (location_id, product_id);

create index if not exists idx_inventory_batches_lookup
  on public.inventory_batches (location_id, product_id, expiry_date, received_at);

create index if not exists idx_inventory_batches_expiry
  on public.inventory_batches (expiry_date)
  where qty_on_hand > 0 and expiry_date is not null;

create index if not exists idx_inventory_transactions_status_created
  on public.inventory_transactions (status, created_at desc);

create index if not exists idx_inventory_transactions_source
  on public.inventory_transactions (source_location_id, created_at desc);

create index if not exists idx_inventory_transactions_destination
  on public.inventory_transactions (destination_location_id, created_at desc);

create index if not exists idx_inventory_transaction_lines_transaction
  on public.inventory_transaction_lines (transaction_id);

create index if not exists idx_stock_ledger_batch
  on public.stock_ledger (batch_id, occurred_at);

create index if not exists idx_transfers_status_created
  on public.transfers (status, created_at desc);

create index if not exists idx_transfers_from_to
  on public.transfers (from_location_id, to_location_id);

create index if not exists idx_alerts_status_due
  on public.alerts (status, due_date, created_at desc);

create unique index if not exists uq_open_alert_signature
  on public.alerts (type, coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'OPEN';

create or replace view public.v_stock_snapshot as
select
  ib.location_id,
  l.code as location_code,
  l.name as location_name,
  ib.product_id,
  p.sku,
  p.name as product_name,
  coalesce(sum(ib.qty_on_hand), 0)::integer as qty_on_hand,
  min(ib.expiry_date) filter (where ib.qty_on_hand > 0 and ib.expiry_date is not null) as nearest_expiry_date
from public.inventory_batches ib
join public.locations l on l.id = ib.location_id
join public.products p on p.id = ib.product_id
group by
  ib.location_id,
  l.code,
  l.name,
  ib.product_id,
  p.sku,
  p.name;

create or replace view public.v_low_stock as
select
  plp.location_id,
  plp.product_id,
  plp.min_qty,
  plp.max_qty,
  plp.reorder_qty,
  coalesce(vs.qty_on_hand, 0)::integer as qty_on_hand,
  (plp.min_qty - coalesce(vs.qty_on_hand, 0))::integer as deficit_qty
from public.product_location_policies plp
left join public.v_stock_snapshot vs
  on vs.location_id = plp.location_id
 and vs.product_id = plp.product_id
where coalesce(vs.qty_on_hand, 0) < plp.min_qty;

create or replace view public.v_expiring_batches as
select
  ib.id as batch_id,
  ib.location_id,
  l.code as location_code,
  l.name as location_name,
  ib.product_id,
  p.sku,
  p.name as product_name,
  ib.lot_number,
  ib.expiry_date,
  ib.qty_on_hand,
  (ib.expiry_date - current_date)::integer as days_to_expiry
from public.inventory_batches ib
join public.locations l on l.id = ib.location_id
join public.products p on p.id = ib.product_id
where ib.qty_on_hand > 0
  and ib.expiry_date is not null
  and ib.expiry_date <= (current_date + interval '30 days');
