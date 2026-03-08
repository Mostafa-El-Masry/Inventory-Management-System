alter table public.inventory_transactions
  add column if not exists supplier_code_snapshot text,
  add column if not exists supplier_name_snapshot text;

alter table public.inventory_transaction_lines
  add column if not exists product_sku_snapshot text,
  add column if not exists product_name_snapshot text,
  add column if not exists product_barcode_snapshot text;

alter table public.supplier_documents
  add column if not exists supplier_code_snapshot text,
  add column if not exists supplier_name_snapshot text;

alter table public.transfer_lines
  add column if not exists product_sku_snapshot text,
  add column if not exists product_name_snapshot text,
  add column if not exists product_barcode_snapshot text;

update public.inventory_transactions as tx
set
  supplier_code_snapshot = supplier.code,
  supplier_name_snapshot = supplier.name
from public.suppliers as supplier
where tx.supplier_id = supplier.id
  and (
    tx.supplier_code_snapshot is null
    or tx.supplier_name_snapshot is null
  );

update public.inventory_transaction_lines as line
set
  product_sku_snapshot = product.sku,
  product_name_snapshot = product.name,
  product_barcode_snapshot = product.barcode
from public.products as product
where line.product_id = product.id
  and (
    line.product_sku_snapshot is null
    or line.product_name_snapshot is null
    or line.product_barcode_snapshot is null
  );

update public.transfer_lines as line
set
  product_sku_snapshot = product.sku,
  product_name_snapshot = product.name,
  product_barcode_snapshot = product.barcode
from public.products as product
where line.product_id = product.id
  and (
    line.product_sku_snapshot is null
    or line.product_name_snapshot is null
    or line.product_barcode_snapshot is null
  );

update public.supplier_documents as document
set
  supplier_code_snapshot = tx.supplier_code_snapshot,
  supplier_name_snapshot = tx.supplier_name_snapshot
from public.inventory_transactions as tx
where document.source_transaction_id = tx.id
  and (
    document.supplier_code_snapshot is null
    or document.supplier_name_snapshot is null
  )
  and (
    tx.supplier_code_snapshot is not null
    or tx.supplier_name_snapshot is not null
  );

update public.supplier_documents as document
set
  supplier_code_snapshot = supplier.code,
  supplier_name_snapshot = supplier.name
from public.suppliers as supplier
where document.supplier_id = supplier.id
  and (
    document.supplier_code_snapshot is null
    or document.supplier_name_snapshot is null
  );
