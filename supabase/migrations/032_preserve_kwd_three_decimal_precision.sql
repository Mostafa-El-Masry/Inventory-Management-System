alter table public.inventory_transaction_lines
  alter column unit_cost type numeric(14, 3);

alter table public.inventory_batches
  alter column unit_cost type numeric(14, 3);

alter table public.supplier_documents
  alter column gross_amount type numeric(14, 3);

alter table public.supplier_document_payments
  alter column amount type numeric(14, 3);

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
          unit_cost = coalesce(round(v_line_total_cost / nullif(v_line.qty, 0), 3), 0),
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
