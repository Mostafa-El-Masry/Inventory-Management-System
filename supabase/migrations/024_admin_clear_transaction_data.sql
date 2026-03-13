create or replace function public.rpc_clear_transaction_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_document_payments_count bigint := 0;
  v_supplier_documents_count bigint := 0;
  v_stock_ledger_count bigint := 0;
  v_inventory_transaction_lines_count bigint := 0;
  v_transfer_lines_count bigint := 0;
  v_transfers_count bigint := 0;
  v_inventory_transactions_count bigint := 0;
  v_inventory_batches_count bigint := 0;
  v_alerts_count bigint := 0;
  v_total_rows_cleared bigint := 0;
begin
  if public.current_role() <> 'admin'::role_type then
    raise exception 'Only admin can clear transaction data.';
  end if;

  select count(*)
  into v_supplier_document_payments_count
  from public.supplier_document_payments as payment
  inner join public.supplier_documents as document
    on document.id = payment.supplier_document_id
  where document.source_transaction_id is not null;

  select count(*)
  into v_supplier_documents_count
  from public.supplier_documents
  where source_transaction_id is not null;

  select count(*) into v_stock_ledger_count from public.stock_ledger;
  select count(*) into v_inventory_transaction_lines_count from public.inventory_transaction_lines;
  select count(*) into v_transfer_lines_count from public.transfer_lines;
  select count(*) into v_transfers_count from public.transfers;
  select count(*) into v_inventory_transactions_count from public.inventory_transactions;
  select count(*) into v_inventory_batches_count from public.inventory_batches;
  select count(*) into v_alerts_count from public.alerts;

  delete from public.supplier_document_payments as payment
  using public.supplier_documents as document
  where document.id = payment.supplier_document_id
    and document.source_transaction_id is not null;

  delete from public.supplier_documents
  where source_transaction_id is not null;

  truncate table
    public.stock_ledger,
    public.inventory_transaction_lines,
    public.transfer_lines,
    public.transfers,
    public.inventory_transactions,
    public.inventory_batches,
    public.alerts;

  v_total_rows_cleared :=
    v_supplier_document_payments_count +
    v_supplier_documents_count +
    v_stock_ledger_count +
    v_inventory_transaction_lines_count +
    v_transfer_lines_count +
    v_transfers_count +
    v_inventory_transactions_count +
    v_inventory_batches_count +
    v_alerts_count;

  return jsonb_build_object(
    'success', true,
    'counts', jsonb_build_object(
      'supplier_document_payments', v_supplier_document_payments_count,
      'supplier_documents', v_supplier_documents_count,
      'stock_ledger', v_stock_ledger_count,
      'inventory_transaction_lines', v_inventory_transaction_lines_count,
      'transfer_lines', v_transfer_lines_count,
      'transfers', v_transfers_count,
      'inventory_transactions', v_inventory_transactions_count,
      'inventory_batches', v_inventory_batches_count,
      'alerts', v_alerts_count
    ),
    'total_rows_cleared', v_total_rows_cleared
  );
end;
$$;

grant execute on function public.rpc_clear_transaction_data() to authenticated;
