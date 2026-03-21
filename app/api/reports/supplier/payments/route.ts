import {
  assertLocationAccess,
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import {
  loadSystemCurrencyCode,
  normalizeSystemCurrencyValue,
  type SystemSettingsReader,
} from "@/lib/settings/system-currency";
import { supplierPaymentCreateSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

function nextPaymentNumber() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 17);
  const suffix = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `PAY-${stamp}-${suffix}`;
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin", "manager"]);
  if (roleError) {
    return roleError;
  }

  const payload = await parseBody(request, supplierPaymentCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const currencyCode = await loadSystemCurrencyCode(
    context.supabase as unknown as SystemSettingsReader,
  );

  const { data: document, error: documentError } = await context.supabase
    .from("supplier_documents")
    .select("id, document_type, status, gross_amount, location_id")
    .eq("id", payload.data.supplier_document_id)
    .maybeSingle();
  if (documentError) {
    return fail(documentError.message, 400);
  }
  if (!document) {
    return fail("Supplier document not found.", 404);
  }

  const locationError = assertLocationAccess(context, document.location_id);
  if (locationError) {
    return locationError;
  }

  if (document.document_type !== "INVOICE") {
    return fail("Payments can only be recorded for supplier invoices.", 409);
  }
  if (document.status !== "OPEN") {
    return fail("Payments can only be recorded for OPEN invoices.", 409);
  }

  const { data: paymentRows, error: paymentListError } = await context.supabase
    .from("supplier_document_payments")
    .select("amount")
    .eq("supplier_document_id", document.id);
  if (paymentListError) {
    return fail(paymentListError.message, 400);
  }

  const paidAmount = (paymentRows ?? []).reduce(
    (sum, row: { amount: number | string }) => sum + Number(row.amount ?? 0),
    0,
  );
  const grossAmount =
    normalizeSystemCurrencyValue(document.gross_amount, currencyCode) ?? 0;
  const normalizedPaidAmount =
    normalizeSystemCurrencyValue(paidAmount, currencyCode) ?? 0;
  const pendingAmount =
    normalizeSystemCurrencyValue(
      Math.max(grossAmount - normalizedPaidAmount, 0),
      currencyCode,
    ) ?? 0;
  const normalizedAmount = normalizeSystemCurrencyValue(
    payload.data.amount,
    currencyCode,
  );

  if (
    normalizedAmount == null ||
    !Number.isFinite(normalizedAmount) ||
    normalizedAmount <= 0
  ) {
    return fail("Payment amount must be greater than 0.", 422);
  }

  if (normalizedAmount > pendingAmount) {
    return fail("Payment amount exceeds invoice pending amount.", 409, {
      pending_amount: pendingAmount,
    });
  }

  const { data, error } = await context.supabase
    .from("supplier_document_payments")
    .insert({
      supplier_document_id: payload.data.supplier_document_id,
      payment_number: nextPaymentNumber(),
      payment_date: payload.data.payment_date,
      amount: normalizedAmount,
      note: payload.data.note ?? null,
      created_by: context.user.id,
    })
    .select("*")
    .single();
  if (error) {
    return fail(error.message, 400);
  }

  return ok({
    payment: data,
    pending_after:
      normalizeSystemCurrencyValue(
        Math.max(pendingAmount - normalizedAmount, 0),
        currencyCode,
      ) ?? 0,
  });
}
