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
    status = 'SUBMITTED',
    posted_by = null,
    posted_at = null,
    updated_at = timezone('utc', now())
  where id = v_tx.id;

  return jsonb_build_object(
    'transaction_id', v_tx.id,
    'status', 'SUBMITTED'
  );
end;
$$;

grant execute on function public.rpc_unpost_transaction(uuid) to authenticated;
