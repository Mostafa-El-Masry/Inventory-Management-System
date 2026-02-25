create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), ''),
    'staff',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.generate_number(prefix text)
returns text
language plpgsql
as $$
begin
  return prefix || '-' || to_char(timezone('utc', now()), 'YYYYMMDDHH24MISSMS') || '-' || lpad((floor(random() * 1000))::text, 3, '0');
end;
$$;

create or replace function public.prevent_posted_transaction_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('POSTED', 'REVERSED') then
      raise exception 'Posted/reversed transactions are immutable.';
    end if;
    return old;
  end if;

  if old.status in ('POSTED', 'REVERSED') then
    if old.status = 'POSTED'
       and new.status = 'REVERSED'
       and new.reversed_by is not null
       and new.reversed_at is not null then
      return new;
    end if;

    raise exception 'Posted/reversed transactions are immutable.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_line_edit_on_draft()
returns trigger
language plpgsql
as $$
declare
  v_status transaction_status;
  v_transaction_id uuid;
begin
  if current_setting('ims.bypass_draft_line_guard', true) = 'on' then
    return coalesce(new, old);
  end if;

  v_transaction_id := coalesce(new.transaction_id, old.transaction_id);

  select status
  into v_status
  from public.inventory_transactions
  where id = v_transaction_id;

  if v_status is distinct from 'DRAFT'::transaction_status then
    raise exception 'Transaction lines can only be modified in DRAFT status.';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.enforce_transfer_line_edit_on_requested()
returns trigger
language plpgsql
as $$
declare
  v_status transfer_status;
  v_transfer_id uuid;
begin
  v_transfer_id := coalesce(new.transfer_id, old.transfer_id);
  select status
  into v_status
  from public.transfers
  where id = v_transfer_id;

  if v_status is distinct from 'REQUESTED'::transfer_status then
    raise exception 'Transfer lines can only be modified while transfer is REQUESTED.';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.audit_row_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
begin
  v_entity_id := coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid);

  insert into public.audit_log (
    actor_user_id,
    entity,
    entity_id,
    action,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    tg_table_name,
    v_entity_id,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create or replace function public.rpc_post_transaction(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.inventory_transactions%rowtype;
  v_line public.inventory_transaction_lines%rowtype;
  v_batch record;
  v_batch_id uuid;
  v_target_location uuid;
  v_source_location uuid;
  v_remaining integer;
  v_take integer;
begin
  if public.current_role() not in ('admin'::role_type, 'manager'::role_type) then
    raise exception 'Only admin or manager can post transactions.';
  end if;

  select *
  into v_tx
  from public.inventory_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found.';
  end if;

  if v_tx.status <> 'SUBMITTED' then
    raise exception 'Only SUBMITTED transactions can be posted.';
  end if;

  for v_line in
    select *
    from public.inventory_transaction_lines
    where transaction_id = p_transaction_id
    order by created_at
  loop
    if v_tx.type in ('RECEIPT', 'RETURN_IN', 'TRANSFER_IN') then
      v_target_location := coalesce(v_tx.destination_location_id, v_tx.source_location_id);

      insert into public.inventory_batches (
        product_id,
        location_id,
        lot_number,
        expiry_date,
        received_at,
        qty_on_hand,
        unit_cost
      )
      values (
        v_line.product_id,
        v_target_location,
        v_line.lot_number,
        v_line.expiry_date,
        timezone('utc', now()),
        v_line.qty,
        v_line.unit_cost
      )
      on conflict (product_id, location_id, lot_number, expiry_date)
      do update set
        qty_on_hand = public.inventory_batches.qty_on_hand + excluded.qty_on_hand,
        unit_cost = coalesce(excluded.unit_cost, public.inventory_batches.unit_cost),
        updated_at = timezone('utc', now())
      returning id into v_batch_id;

      insert into public.stock_ledger (
        transaction_line_id,
        product_id,
        location_id,
        batch_id,
        direction,
        qty,
        occurred_at,
        created_by
      )
      values (
        v_line.id,
        v_line.product_id,
        v_target_location,
        v_batch_id,
        'IN',
        v_line.qty,
        timezone('utc', now()),
        auth.uid()
      );
    elsif v_tx.type in ('ISSUE', 'RETURN_OUT', 'TRANSFER_OUT') then
      v_source_location := coalesce(v_tx.source_location_id, v_tx.destination_location_id);
      v_remaining := v_line.qty;

      for v_batch in
        select id, qty_on_hand
        from public.inventory_batches
        where product_id = v_line.product_id
          and location_id = v_source_location
          and qty_on_hand > 0
        order by expiry_date asc nulls last, received_at asc
        for update
      loop
        exit when v_remaining <= 0;

        v_take := least(v_remaining, v_batch.qty_on_hand);

        update public.inventory_batches
        set
          qty_on_hand = qty_on_hand - v_take,
          updated_at = timezone('utc', now())
        where id = v_batch.id;

        insert into public.stock_ledger (
          transaction_line_id,
          product_id,
          location_id,
          batch_id,
          direction,
          qty,
          occurred_at,
          created_by
        )
        values (
          v_line.id,
          v_line.product_id,
          v_source_location,
          v_batch.id,
          'OUT',
          v_take,
          timezone('utc', now()),
          auth.uid()
        );

        v_remaining := v_remaining - v_take;
      end loop;

      if v_remaining > 0 then
        raise exception 'Insufficient stock for product %.', v_line.product_id;
      end if;
    elsif v_tx.type in ('ADJUSTMENT', 'CYCLE_COUNT') then
      if coalesce(v_line.reason_code, '') = 'DECREASE' then
        v_source_location := coalesce(v_tx.source_location_id, v_tx.destination_location_id);
        v_remaining := v_line.qty;

        for v_batch in
          select id, qty_on_hand
          from public.inventory_batches
          where product_id = v_line.product_id
            and location_id = v_source_location
            and qty_on_hand > 0
          order by expiry_date asc nulls last, received_at asc
          for update
        loop
          exit when v_remaining <= 0;
          v_take := least(v_remaining, v_batch.qty_on_hand);

          update public.inventory_batches
          set qty_on_hand = qty_on_hand - v_take, updated_at = timezone('utc', now())
          where id = v_batch.id;

          insert into public.stock_ledger (
            transaction_line_id,
            product_id,
            location_id,
            batch_id,
            direction,
            qty,
            occurred_at,
            created_by
          )
          values (
            v_line.id,
            v_line.product_id,
            v_source_location,
            v_batch.id,
            'OUT',
            v_take,
            timezone('utc', now()),
            auth.uid()
          );

          v_remaining := v_remaining - v_take;
        end loop;

        if v_remaining > 0 then
          raise exception 'Insufficient stock for adjustment.';
        end if;
      else
        v_target_location := coalesce(v_tx.destination_location_id, v_tx.source_location_id);

        insert into public.inventory_batches (
          product_id,
          location_id,
          lot_number,
          expiry_date,
          received_at,
          qty_on_hand,
          unit_cost
        )
        values (
          v_line.product_id,
          v_target_location,
          v_line.lot_number,
          v_line.expiry_date,
          timezone('utc', now()),
          v_line.qty,
          v_line.unit_cost
        )
        on conflict (product_id, location_id, lot_number, expiry_date)
        do update set
          qty_on_hand = public.inventory_batches.qty_on_hand + excluded.qty_on_hand,
          unit_cost = coalesce(excluded.unit_cost, public.inventory_batches.unit_cost),
          updated_at = timezone('utc', now())
        returning id into v_batch_id;

        insert into public.stock_ledger (
          transaction_line_id,
          product_id,
          location_id,
          batch_id,
          direction,
          qty,
          occurred_at,
          created_by
        )
        values (
          v_line.id,
          v_line.product_id,
          v_target_location,
          v_batch_id,
          'IN',
          v_line.qty,
          timezone('utc', now()),
          auth.uid()
        );
      end if;
    else
      raise exception 'Unsupported transaction type for posting: %', v_tx.type;
    end if;
  end loop;

  update public.inventory_transactions
  set
    status = 'POSTED',
    posted_by = auth.uid(),
    posted_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = v_tx.id;

  return jsonb_build_object(
    'transaction_id', v_tx.id,
    'status', 'POSTED'
  );
end;
$$;

create or replace function public.rpc_reverse_transaction(p_transaction_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.inventory_transactions%rowtype;
  v_line public.inventory_transaction_lines%rowtype;
  v_ledger public.stock_ledger%rowtype;
  v_reversal_id uuid;
  v_reversal_line_id uuid;
  v_current_qty integer;
begin
  if public.current_role() not in ('admin'::role_type, 'manager'::role_type) then
    raise exception 'Only admin or manager can reverse transactions.';
  end if;

  select *
  into v_tx
  from public.inventory_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found.';
  end if;

  if v_tx.status <> 'POSTED' then
    raise exception 'Only POSTED transactions can be reversed.';
  end if;

  insert into public.inventory_transactions (
    tx_number,
    type,
    status,
    source_location_id,
    destination_location_id,
    reference_type,
    reference_id,
    notes,
    reversal_reason,
    created_by,
    submitted_by,
    posted_by,
    submitted_at,
    posted_at
  )
  values (
    public.generate_number('RV'),
    'REVERSAL',
    'POSTED',
    v_tx.destination_location_id,
    v_tx.source_location_id,
    'TRANSACTION',
    v_tx.id,
    coalesce('Reversal of ' || v_tx.tx_number || ': ' || p_reason, 'Reversal'),
    p_reason,
    auth.uid(),
    auth.uid(),
    auth.uid(),
    timezone('utc', now()),
    timezone('utc', now())
  )
  returning id into v_reversal_id;

  perform set_config('ims.bypass_draft_line_guard', 'on', true);

  for v_line in
    select *
    from public.inventory_transaction_lines
    where transaction_id = v_tx.id
    order by created_at
  loop
    insert into public.inventory_transaction_lines (
      transaction_id,
      product_id,
      qty,
      unit_cost,
      lot_number,
      expiry_date,
      reason_code
    )
    values (
      v_reversal_id,
      v_line.product_id,
      v_line.qty,
      v_line.unit_cost,
      v_line.lot_number,
      v_line.expiry_date,
      'REVERSAL'
    )
    returning id into v_reversal_line_id;

    for v_ledger in
      select *
      from public.stock_ledger
      where transaction_line_id = v_line.id
      order by occurred_at
    loop
      select qty_on_hand
      into v_current_qty
      from public.inventory_batches
      where id = v_ledger.batch_id
      for update;

      if v_ledger.direction = 'IN' then
        if v_current_qty < v_ledger.qty then
          raise exception 'Cannot reverse transaction; stock was already consumed.';
        end if;

        update public.inventory_batches
        set qty_on_hand = qty_on_hand - v_ledger.qty, updated_at = timezone('utc', now())
        where id = v_ledger.batch_id;

        insert into public.stock_ledger (
          transaction_line_id,
          product_id,
          location_id,
          batch_id,
          direction,
          qty,
          occurred_at,
          created_by
        )
        values (
          v_reversal_line_id,
          v_ledger.product_id,
          v_ledger.location_id,
          v_ledger.batch_id,
          'OUT',
          v_ledger.qty,
          timezone('utc', now()),
          auth.uid()
        );
      else
        update public.inventory_batches
        set qty_on_hand = qty_on_hand + v_ledger.qty, updated_at = timezone('utc', now())
        where id = v_ledger.batch_id;

        insert into public.stock_ledger (
          transaction_line_id,
          product_id,
          location_id,
          batch_id,
          direction,
          qty,
          occurred_at,
          created_by
        )
        values (
          v_reversal_line_id,
          v_ledger.product_id,
          v_ledger.location_id,
          v_ledger.batch_id,
          'IN',
          v_ledger.qty,
          timezone('utc', now()),
          auth.uid()
        );
      end if;
    end loop;
  end loop;

  perform set_config('ims.bypass_draft_line_guard', 'off', true);

  update public.inventory_transactions
  set
    status = 'REVERSED',
    reversed_by = auth.uid(),
    reversed_at = timezone('utc', now()),
    reversal_reason = p_reason,
    updated_at = timezone('utc', now())
  where id = v_tx.id;

  return jsonb_build_object(
    'original_transaction_id', v_tx.id,
    'reversal_transaction_id', v_reversal_id,
    'status', 'REVERSED'
  );
end;
$$;

create or replace function public.rpc_dispatch_transfer(p_transfer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.transfers%rowtype;
  v_line public.transfer_lines%rowtype;
  v_tx_id uuid;
begin
  if public.current_role() not in ('admin'::role_type, 'manager'::role_type) then
    raise exception 'Only admin or manager can dispatch transfers.';
  end if;

  select *
  into v_transfer
  from public.transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found.';
  end if;

  if v_transfer.status <> 'APPROVED' then
    raise exception 'Only APPROVED transfers can be dispatched.';
  end if;

  insert into public.inventory_transactions (
    tx_number,
    type,
    status,
    source_location_id,
    destination_location_id,
    reference_type,
    reference_id,
    notes,
    created_by,
    submitted_by,
    submitted_at
  )
  values (
    public.generate_number('TX'),
    'TRANSFER_OUT',
    'SUBMITTED',
    v_transfer.from_location_id,
    v_transfer.to_location_id,
    'TRANSFER',
    v_transfer.id,
    coalesce(v_transfer.notes, 'Transfer dispatch'),
    auth.uid(),
    auth.uid(),
    timezone('utc', now())
  )
  returning id into v_tx_id;

  perform set_config('ims.bypass_draft_line_guard', 'on', true);

  for v_line in
    select *
    from public.transfer_lines
    where transfer_id = v_transfer.id
    order by created_at
  loop
    insert into public.inventory_transaction_lines (
      transaction_id,
      product_id,
      qty,
      reason_code
    )
    values (
      v_tx_id,
      v_line.product_id,
      v_line.requested_qty,
      'TRANSFER_DISPATCH'
    );

    update public.transfer_lines
    set
      dispatched_qty = v_line.requested_qty,
      updated_at = timezone('utc', now())
    where id = v_line.id;
  end loop;

  perform set_config('ims.bypass_draft_line_guard', 'off', true);

  perform public.rpc_post_transaction(v_tx_id);

  update public.transfers
  set
    status = 'DISPATCHED',
    dispatched_by = auth.uid(),
    dispatched_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = v_transfer.id;

  return jsonb_build_object(
    'transfer_id', v_transfer.id,
    'dispatch_transaction_id', v_tx_id,
    'status', 'DISPATCHED'
  );
end;
$$;

create or replace function public.rpc_receive_transfer(p_transfer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.transfers%rowtype;
  v_line public.transfer_lines%rowtype;
  v_tx_id uuid;
begin
  if public.current_role() not in ('admin'::role_type, 'manager'::role_type) then
    raise exception 'Only admin or manager can receive transfers.';
  end if;

  select *
  into v_transfer
  from public.transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found.';
  end if;

  if v_transfer.status <> 'DISPATCHED' then
    raise exception 'Only DISPATCHED transfers can be received.';
  end if;

  insert into public.inventory_transactions (
    tx_number,
    type,
    status,
    source_location_id,
    destination_location_id,
    reference_type,
    reference_id,
    notes,
    created_by,
    submitted_by,
    submitted_at
  )
  values (
    public.generate_number('TX'),
    'TRANSFER_IN',
    'SUBMITTED',
    v_transfer.from_location_id,
    v_transfer.to_location_id,
    'TRANSFER',
    v_transfer.id,
    coalesce(v_transfer.notes, 'Transfer receipt'),
    auth.uid(),
    auth.uid(),
    timezone('utc', now())
  )
  returning id into v_tx_id;

  perform set_config('ims.bypass_draft_line_guard', 'on', true);

  for v_line in
    select *
    from public.transfer_lines
    where transfer_id = v_transfer.id
    order by created_at
  loop
    if v_line.dispatched_qty <> v_line.requested_qty then
      raise exception 'Partial dispatch/receive is not allowed in v1.';
    end if;

    insert into public.inventory_transaction_lines (
      transaction_id,
      product_id,
      qty,
      reason_code
    )
    values (
      v_tx_id,
      v_line.product_id,
      v_line.dispatched_qty,
      'TRANSFER_RECEIVE'
    );

    update public.transfer_lines
    set
      received_qty = v_line.dispatched_qty,
      updated_at = timezone('utc', now())
    where id = v_line.id;
  end loop;

  perform set_config('ims.bypass_draft_line_guard', 'off', true);

  perform public.rpc_post_transaction(v_tx_id);

  update public.transfers
  set
    status = 'RECEIVED',
    received_by = auth.uid(),
    received_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = v_transfer.id;

  return jsonb_build_object(
    'transfer_id', v_transfer.id,
    'receipt_transaction_id', v_tx_id,
    'status', 'RECEIVED'
  );
end;
$$;

create or replace function public.rpc_refresh_alerts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_low_count integer := 0;
  v_expiry_count integer := 0;
begin
  update public.alerts
  set
    status = 'CLOSED',
    updated_at = timezone('utc', now())
  where status = 'OPEN'
    and type in ('LOW_STOCK', 'EXPIRY');

  with inserted as (
    insert into public.alerts (
      type,
      severity,
      product_id,
      location_id,
      message,
      status,
      due_date
    )
    select
      'LOW_STOCK'::alert_type,
      'WARN'::alert_severity,
      ls.product_id,
      ls.location_id,
      'Low stock: on hand ' || ls.qty_on_hand || ', minimum ' || ls.min_qty,
      'OPEN'::alert_status,
      null
    from public.v_low_stock ls
    returning 1
  )
  select count(*)
  into v_low_count
  from inserted;

  with inserted as (
    insert into public.alerts (
      type,
      severity,
      product_id,
      location_id,
      batch_id,
      message,
      status,
      due_date
    )
    select
      'EXPIRY'::alert_type,
      case
        when vb.days_to_expiry <= 7 then 'CRITICAL'::alert_severity
        when vb.days_to_expiry <= 14 then 'WARN'::alert_severity
        else 'INFO'::alert_severity
      end,
      vb.product_id,
      vb.location_id,
      vb.batch_id,
      'Batch expires in ' || vb.days_to_expiry || ' day(s).',
      'OPEN'::alert_status,
      vb.expiry_date
    from public.v_expiring_batches vb
    where vb.days_to_expiry between 0 and 30
    returning 1
  )
  select count(*)
  into v_expiry_count
  from inserted;

  return jsonb_build_object(
    'low_stock_alerts', v_low_count,
    'expiry_alerts', v_expiry_count
  );
end;
$$;

drop trigger if exists trg_locations_set_updated_at on public.locations;
create trigger trg_locations_set_updated_at
before update on public.locations
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_products_set_updated_at on public.products;
create trigger trg_products_set_updated_at
before update on public.products
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_policies_set_updated_at on public.product_location_policies;
create trigger trg_policies_set_updated_at
before update on public.product_location_policies
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_transfers_set_updated_at on public.transfers;
create trigger trg_transfers_set_updated_at
before update on public.transfers
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_transfer_lines_set_updated_at on public.transfer_lines;
create trigger trg_transfer_lines_set_updated_at
before update on public.transfer_lines
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_alerts_set_updated_at on public.alerts;
create trigger trg_alerts_set_updated_at
before update on public.alerts
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_inventory_transactions_set_updated_at on public.inventory_transactions;
create trigger trg_inventory_transactions_set_updated_at
before update on public.inventory_transactions
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_inventory_lines_set_updated_at on public.inventory_transaction_lines;
create trigger trg_inventory_lines_set_updated_at
before update on public.inventory_transaction_lines
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_inventory_batches_set_updated_at on public.inventory_batches;
create trigger trg_inventory_batches_set_updated_at
before update on public.inventory_batches
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_prevent_posted_transaction_mutation on public.inventory_transactions;
create trigger trg_prevent_posted_transaction_mutation
before update or delete on public.inventory_transactions
for each row execute procedure public.prevent_posted_transaction_mutation();

drop trigger if exists trg_enforce_line_edit_on_draft on public.inventory_transaction_lines;
create trigger trg_enforce_line_edit_on_draft
before insert or update or delete on public.inventory_transaction_lines
for each row execute procedure public.enforce_line_edit_on_draft();

drop trigger if exists trg_enforce_transfer_line_edit_on_requested on public.transfer_lines;
create trigger trg_enforce_transfer_line_edit_on_requested
before insert or update or delete on public.transfer_lines
for each row execute procedure public.enforce_transfer_line_edit_on_requested();

drop trigger if exists trg_audit_products on public.products;
create trigger trg_audit_products
after insert or update or delete on public.products
for each row execute procedure public.audit_row_changes();

drop trigger if exists trg_audit_locations on public.locations;
create trigger trg_audit_locations
after insert or update or delete on public.locations
for each row execute procedure public.audit_row_changes();

drop trigger if exists trg_audit_transactions on public.inventory_transactions;
create trigger trg_audit_transactions
after insert or update or delete on public.inventory_transactions
for each row execute procedure public.audit_row_changes();

drop trigger if exists trg_audit_transfers on public.transfers;
create trigger trg_audit_transfers
after insert or update or delete on public.transfers
for each row execute procedure public.audit_row_changes();

drop trigger if exists trg_audit_alerts on public.alerts;
create trigger trg_audit_alerts
after insert or update or delete on public.alerts
for each row execute procedure public.audit_row_changes();

grant execute on function public.rpc_post_transaction(uuid) to authenticated;
grant execute on function public.rpc_reverse_transaction(uuid, text) to authenticated;
grant execute on function public.rpc_dispatch_transfer(uuid) to authenticated;
grant execute on function public.rpc_receive_transfer(uuid) to authenticated;
grant execute on function public.rpc_refresh_alerts() to authenticated;
