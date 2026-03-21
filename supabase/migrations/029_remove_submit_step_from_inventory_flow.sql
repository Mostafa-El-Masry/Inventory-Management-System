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
  v_line_total_cost numeric := 0;
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

  if v_tx.status not in ('DRAFT', 'SUBMITTED') then
    raise exception 'Only DRAFT or SUBMITTED transactions can be posted.';
  end if;

  for v_line in
    select *
    from public.inventory_transaction_lines
    where transaction_id = p_transaction_id
    order by created_at
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
        auth.uid()
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
          auth.uid()
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

grant execute on function public.rpc_post_transaction(uuid) to authenticated;

create or replace function public.rpc_unpost_transaction(p_transaction_id uuid)
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
        raise exception 'Inventory batch not found during unpost.';
      end if;

      if v_ledger.direction = 'IN' then
        if v_current_qty < v_ledger.qty then
          raise exception 'Cannot unpost transaction; stock was already consumed.';
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

  if v_supplier_document_id is not null then
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

grant execute on function public.rpc_unpost_transaction(uuid) to authenticated;

update public.inventory_transactions
set
  status = 'DRAFT',
  submitted_by = null,
  submitted_at = null,
  updated_at = timezone('utc', now())
where status = 'SUBMITTED';
