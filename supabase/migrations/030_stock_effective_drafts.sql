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

    if old.status = 'POSTED'
       and new.status = 'DRAFT'
       and public.current_role() = 'admin'::role_type
       and new.posted_by is null
       and new.posted_at is null then
      return new;
    end if;

    raise exception 'Posted/reversed transactions are immutable.';
  end if;

  return new;
end;
$$;

create or replace function public.rpc_apply_transaction_effect(p_transaction_id uuid)
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
  v_line_total_cost numeric := 0;
  v_actor_user_id uuid;
begin
  select *
  into v_tx
  from public.inventory_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found.';
  end if;

  if exists (
    select 1
    from public.stock_ledger
    where transaction_line_id in (
      select id
      from public.inventory_transaction_lines
      where transaction_id = p_transaction_id
    )
  ) then
    raise exception 'Transaction stock effect is already applied.';
  end if;

  v_actor_user_id := coalesce(auth.uid(), v_tx.created_by);

  for v_line in
    select *
    from public.inventory_transaction_lines
    where transaction_id = p_transaction_id
    order by created_at, id
  loop
    v_line_total_cost := 0;

    if v_tx.type::text in ('RECEIPT', 'RETURN_IN', 'TRANSFER_IN') then
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
        v_actor_user_id
      );
    elsif v_tx.type::text in ('ISSUE', 'RETURN_OUT', 'TRANSFER_OUT', 'CONSUMPTION') then
      v_source_location := coalesce(v_tx.source_location_id, v_tx.destination_location_id);
      v_remaining := v_line.qty;

      for v_batch in
        select id, qty_on_hand, unit_cost
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
          v_actor_user_id
        );

        if v_tx.type::text = 'CONSUMPTION' then
          v_line_total_cost := v_line_total_cost + (coalesce(v_batch.unit_cost, 0) * v_take);
        end if;

        v_remaining := v_remaining - v_take;
      end loop;

      if v_remaining > 0 then
        if v_tx.type::text = 'CONSUMPTION' then
          raise exception 'Insufficient stock for consumption.';
        end if;

        raise exception 'Insufficient stock for product %.', v_line.product_id;
      end if;

      if v_tx.type::text = 'CONSUMPTION' then
        update public.inventory_transaction_lines
        set
          unit_cost = coalesce(round(v_line_total_cost / nullif(v_line.qty, 0), 2), 0),
          updated_at = timezone('utc', now())
        where id = v_line.id;
      end if;
    elsif v_tx.type::text in ('ADJUSTMENT', 'CYCLE_COUNT') then
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
            v_actor_user_id
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
          v_actor_user_id
        );
      end if;
    else
      raise exception 'Unsupported transaction type for stock effect: %', v_tx.type;
    end if;
  end loop;

  return jsonb_build_object(
    'transaction_id', v_tx.id,
    'status', v_tx.status
  );
end;
$$;

create or replace function public.rpc_remove_transaction_effect(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.inventory_transactions%rowtype;
  v_line public.inventory_transaction_lines%rowtype;
  v_ledger public.stock_ledger%rowtype;
  v_current_qty integer;
begin
  select *
  into v_tx
  from public.inventory_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found.';
  end if;

  for v_line in
    select *
    from public.inventory_transaction_lines
    where transaction_id = p_transaction_id
    order by created_at desc, id desc
  loop
    for v_ledger in
      select *
      from public.stock_ledger
      where transaction_line_id = v_line.id
      order by occurred_at desc, id desc
    loop
      select qty_on_hand
      into v_current_qty
      from public.inventory_batches
      where id = v_ledger.batch_id
      for update;

      if not found then
        raise exception 'Inventory batch not found while removing stock effect.';
      end if;

      if v_ledger.direction = 'IN' then
        if v_current_qty < v_ledger.qty then
          raise exception 'Cannot change draft; stock from this transaction was already consumed.';
        end if;

        update public.inventory_batches
        set
          qty_on_hand = qty_on_hand - v_ledger.qty,
          updated_at = timezone('utc', now())
        where id = v_ledger.batch_id;
      else
        update public.inventory_batches
        set
          qty_on_hand = qty_on_hand + v_ledger.qty,
          updated_at = timezone('utc', now())
        where id = v_ledger.batch_id;
      end if;
    end loop;
  end loop;

  delete from public.stock_ledger
  where transaction_line_id in (
    select id
    from public.inventory_transaction_lines
    where transaction_id = p_transaction_id
  );

  if v_tx.type = 'CONSUMPTION'::transaction_type then
    update public.inventory_transaction_lines
    set
      unit_cost = null,
      updated_at = timezone('utc', now())
    where transaction_id = p_transaction_id;
  end if;

  return jsonb_build_object(
    'transaction_id', v_tx.id,
    'status', v_tx.status
  );
end;
$$;

create or replace function public.rpc_save_inventory_draft(
  p_transaction_id uuid,
  p_transaction jsonb,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.inventory_transactions%rowtype;
  v_transaction_type public.transaction_type;
begin
  if public.current_role() not in ('admin'::role_type, 'manager'::role_type, 'staff'::role_type) then
    raise exception 'Only admin, manager, or staff can save draft transactions.';
  end if;

  if coalesce(jsonb_array_length(coalesce(p_lines, '[]'::jsonb)), 0) = 0 then
    raise exception 'At least one transaction line is required.';
  end if;

  v_transaction_type := (p_transaction ->> 'type')::public.transaction_type;

  if p_transaction_id is null then
    insert into public.inventory_transactions (
      tx_number,
      type,
      status,
      source_location_id,
      destination_location_id,
      reference_type,
      reference_id,
      supplier_id,
      supplier_code_snapshot,
      supplier_name_snapshot,
      supplier_invoice_number,
      supplier_invoice_date,
      notes,
      created_by
    )
    values (
      coalesce(nullif(p_transaction ->> 'tx_number', ''), public.generate_number('TX')),
      v_transaction_type,
      'DRAFT',
      nullif(p_transaction ->> 'source_location_id', '')::uuid,
      nullif(p_transaction ->> 'destination_location_id', '')::uuid,
      nullif(p_transaction ->> 'reference_type', ''),
      nullif(p_transaction ->> 'reference_id', '')::uuid,
      nullif(p_transaction ->> 'supplier_id', '')::uuid,
      nullif(p_transaction ->> 'supplier_code_snapshot', ''),
      nullif(p_transaction ->> 'supplier_name_snapshot', ''),
      nullif(p_transaction ->> 'supplier_invoice_number', ''),
      nullif(p_transaction ->> 'supplier_invoice_date', '')::date,
      nullif(p_transaction ->> 'notes', ''),
      auth.uid()
    )
    returning * into v_tx;
  else
    select *
    into v_tx
    from public.inventory_transactions
    where id = p_transaction_id
    for update;

    if not found then
      raise exception 'Transaction not found.';
    end if;

    if v_tx.status <> 'DRAFT' then
      raise exception 'Only DRAFT transactions can be updated.';
    end if;

    if v_tx.type <> v_transaction_type then
      raise exception 'Transaction type cannot be changed.';
    end if;

    perform public.rpc_remove_transaction_effect(v_tx.id);

    update public.inventory_transactions
    set
      source_location_id = nullif(p_transaction ->> 'source_location_id', '')::uuid,
      destination_location_id = nullif(p_transaction ->> 'destination_location_id', '')::uuid,
      reference_type = nullif(p_transaction ->> 'reference_type', ''),
      reference_id = nullif(p_transaction ->> 'reference_id', '')::uuid,
      supplier_id = nullif(p_transaction ->> 'supplier_id', '')::uuid,
      supplier_code_snapshot = nullif(p_transaction ->> 'supplier_code_snapshot', ''),
      supplier_name_snapshot = nullif(p_transaction ->> 'supplier_name_snapshot', ''),
      supplier_invoice_number = nullif(p_transaction ->> 'supplier_invoice_number', ''),
      supplier_invoice_date = nullif(p_transaction ->> 'supplier_invoice_date', '')::date,
      notes = nullif(p_transaction ->> 'notes', ''),
      updated_at = timezone('utc', now())
    where id = v_tx.id
    returning * into v_tx;

    delete from public.inventory_transaction_lines
    where transaction_id = v_tx.id;
  end if;

  insert into public.inventory_transaction_lines (
    transaction_id,
    product_id,
    qty,
    unit_cost,
    lot_number,
    expiry_date,
    reason_code,
    product_sku_snapshot,
    product_name_snapshot,
    product_barcode_snapshot
  )
  select
    v_tx.id,
    line.product_id,
    line.qty,
    line.unit_cost,
    nullif(line.lot_number, ''),
    line.expiry_date,
    nullif(line.reason_code, ''),
    nullif(line.product_sku_snapshot, ''),
    nullif(line.product_name_snapshot, ''),
    nullif(line.product_barcode_snapshot, '')
  from jsonb_to_recordset(p_lines) as line(
    product_id uuid,
    qty integer,
    unit_cost numeric,
    lot_number text,
    expiry_date date,
    reason_code text,
    product_sku_snapshot text,
    product_name_snapshot text,
    product_barcode_snapshot text
  );

  perform public.rpc_apply_transaction_effect(v_tx.id);

  return jsonb_build_object(
    'id', v_tx.id,
    'tx_number', v_tx.tx_number,
    'type', v_tx.type,
    'status', v_tx.status
  );
end;
$$;

create or replace function public.rpc_delete_inventory_draft(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.inventory_transactions%rowtype;
begin
  if public.current_role() not in ('admin'::role_type, 'manager'::role_type, 'staff'::role_type) then
    raise exception 'Only admin, manager, or staff can delete draft transactions.';
  end if;

  select *
  into v_tx
  from public.inventory_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found.';
  end if;

  if v_tx.status <> 'DRAFT' then
    raise exception 'Only DRAFT transactions can be deleted.';
  end if;

  perform public.rpc_remove_transaction_effect(v_tx.id);

  delete from public.inventory_transactions
  where id = v_tx.id;

  return jsonb_build_object(
    'transaction_id', p_transaction_id,
    'success', true
  );
end;
$$;

create or replace function public.rpc_finalize_inventory_transaction(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.inventory_transactions%rowtype;
  v_currency text := 'KWD';
  v_gross_amount numeric := 0;
  v_location_id uuid;
  v_document_type public.supplier_document_type;
  v_document_date date;
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

  if v_tx.status <> 'DRAFT' then
    raise exception 'Only DRAFT transactions can be posted.';
  end if;

  if not exists (
    select 1
    from public.stock_ledger
    where transaction_line_id in (
      select id
      from public.inventory_transaction_lines
      where transaction_id = v_tx.id
    )
  ) then
    raise exception 'Draft stock effect is missing. Save the transaction again before posting.';
  end if;

  if v_tx.type::text in ('RECEIPT', 'RETURN_OUT')
     and v_tx.supplier_id is not null
     and nullif(btrim(coalesce(v_tx.supplier_invoice_number, '')), '') is not null then
    select case
      when upper(coalesce(value_text, '')) in ('KWD', 'USD', 'EGP') then upper(value_text)
      else 'KWD'
    end
    into v_currency
    from public.system_settings
    where key = 'currency_code';

    select coalesce(sum(coalesce(qty, 0) * coalesce(unit_cost, 0)), 0)
    into v_gross_amount
    from public.inventory_transaction_lines
    where transaction_id = v_tx.id;

    v_location_id := case
      when v_tx.type = 'RECEIPT'::public.transaction_type then v_tx.destination_location_id
      else v_tx.source_location_id
    end;

    if v_location_id is null then
      raise exception 'Supplier document location is missing.';
    end if;

    v_document_type := case
      when v_tx.type = 'RECEIPT'::public.transaction_type then 'INVOICE'::public.supplier_document_type
      else 'CREDIT_NOTE'::public.supplier_document_type
    end;
    v_document_date := coalesce(v_tx.supplier_invoice_date, v_tx.created_at::date);

    insert into public.supplier_documents (
      supplier_id,
      supplier_code_snapshot,
      supplier_name_snapshot,
      location_id,
      source_transaction_id,
      document_type,
      document_number,
      document_date,
      currency,
      gross_amount,
      status,
      created_by
    )
    values (
      v_tx.supplier_id,
      v_tx.supplier_code_snapshot,
      v_tx.supplier_name_snapshot,
      v_location_id,
      v_tx.id,
      v_document_type,
      v_tx.supplier_invoice_number,
      v_document_date,
      v_currency,
      v_gross_amount,
      'OPEN',
      auth.uid()
    )
    on conflict (source_transaction_id)
    do update set
      supplier_id = excluded.supplier_id,
      supplier_code_snapshot = excluded.supplier_code_snapshot,
      supplier_name_snapshot = excluded.supplier_name_snapshot,
      location_id = excluded.location_id,
      document_type = excluded.document_type,
      document_number = excluded.document_number,
      document_date = excluded.document_date,
      currency = excluded.currency,
      gross_amount = excluded.gross_amount,
      status = 'OPEN',
      updated_at = timezone('utc', now());
  end if;

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

create or replace function public.rpc_unpost_transaction(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.inventory_transactions%rowtype;
  v_supplier_document_id uuid;
  v_supplier_payment_count bigint := 0;
begin
  if public.current_role() <> 'admin'::role_type then
    raise exception 'Only admin can unpost transactions.';
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
    raise exception 'Only POSTED transactions can be unposted.';
  end if;

  select id
  into v_supplier_document_id
  from public.supplier_documents
  where source_transaction_id = p_transaction_id
  for update;

  if found then
    select count(*)
    into v_supplier_payment_count
    from public.supplier_document_payments
    where supplier_document_id = v_supplier_document_id;

    if v_supplier_payment_count > 0 then
      raise exception 'Cannot unpost transaction; supplier payments already exist.';
    end if;

    delete from public.supplier_documents
    where id = v_supplier_document_id;
  end if;

  update public.inventory_transactions
  set
    status = 'DRAFT',
    submitted_by = null,
    submitted_at = null,
    posted_by = null,
    posted_at = null,
    updated_at = timezone('utc', now())
  where id = v_tx.id;

  return jsonb_build_object(
    'transaction_id', v_tx.id,
    'status', 'DRAFT'
  );
end;
$$;

grant execute on function public.rpc_save_inventory_draft(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.rpc_delete_inventory_draft(uuid) to authenticated;
grant execute on function public.rpc_finalize_inventory_transaction(uuid) to authenticated;
grant execute on function public.rpc_unpost_transaction(uuid) to authenticated;

do $$
declare
  v_tx record;
begin
  for v_tx in
    select id
    from public.inventory_transactions
    where status = 'DRAFT'
    order by created_at, id
  loop
    perform public.rpc_apply_transaction_effect(v_tx.id);
  end loop;
end;
$$;
