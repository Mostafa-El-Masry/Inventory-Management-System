do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.inventory_transactions'::regclass
      and c.contype = 'c'
      and (
        c.conname in (
          'inventory_transactions_check',
          'inventory_transactions_location_requirements_check'
        )
        or (
          pg_get_constraintdef(c.oid) ilike '%RECEIPT%'
          and pg_get_constraintdef(c.oid) ilike '%RETURN_IN%'
          and pg_get_constraintdef(c.oid) ilike '%TRANSFER_IN%'
          and pg_get_constraintdef(c.oid) ilike '%ISSUE%'
          and pg_get_constraintdef(c.oid) ilike '%RETURN_OUT%'
          and pg_get_constraintdef(c.oid) ilike '%TRANSFER_OUT%'
        )
      )
  loop
    execute format(
      'alter table public.inventory_transactions drop constraint %I',
      v_constraint.conname
    );
  end loop;

  alter table public.inventory_transactions
    add constraint inventory_transactions_location_requirements_check
    check (
      (
        type::text in ('RECEIPT', 'RETURN_IN', 'TRANSFER_IN')
        and destination_location_id is not null
      ) or (
        type::text in ('ISSUE', 'RETURN_OUT', 'TRANSFER_OUT', 'CONSUMPTION')
        and source_location_id is not null
      ) or (
        type::text in ('ADJUSTMENT', 'CYCLE_COUNT', 'REVERSAL')
      )
    );
end $$;

create or replace function public.enforce_transfer_line_edit_on_requested()
returns trigger
language plpgsql
as $$
declare
  v_status transfer_status;
  v_transfer_id uuid;
begin
  if current_setting('ims.bypass_transfer_line_guard', true) = 'on' then
    return coalesce(new, old);
  end if;

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
  perform set_config('ims.bypass_transfer_line_guard', 'on', true);

  begin
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
  exception
    when others then
      perform set_config('ims.bypass_draft_line_guard', 'off', true);
      perform set_config('ims.bypass_transfer_line_guard', 'off', true);
      raise;
  end;

  perform set_config('ims.bypass_draft_line_guard', 'off', true);
  perform set_config('ims.bypass_transfer_line_guard', 'off', true);

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
  perform set_config('ims.bypass_transfer_line_guard', 'on', true);

  begin
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
  exception
    when others then
      perform set_config('ims.bypass_draft_line_guard', 'off', true);
      perform set_config('ims.bypass_transfer_line_guard', 'off', true);
      raise;
  end;

  perform set_config('ims.bypass_draft_line_guard', 'off', true);
  perform set_config('ims.bypass_transfer_line_guard', 'off', true);

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
