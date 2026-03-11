import { z } from "zod";

import { AuthContext, assertLocationAccess } from "@/lib/auth/permissions";
import {
  isMissingSnapshotColumnError,
  stripSnapshotFieldsFromRows,
} from "@/lib/supabase/snapshot-schema-compat";
import { serviceFail, serviceOk, type ServiceResult } from "@/lib/utils/service-result";
import { transferCreateSchema } from "@/lib/validation";

type TransferCreateInput = z.infer<typeof transferCreateSchema>;

type ProductRow = {
  id: string;
  sku: string | null;
  name: string | null;
  barcode: string | null;
};

type TransferSummary = {
  id: string;
  transfer_number: string | null;
  status: string;
};

async function readResponseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function createTransfer(context: AuthContext, payload: TransferCreateInput) {
  const sourceError = assertLocationAccess(context, payload.from_location_id);
  if (sourceError) {
    return serviceFail(
      sourceError.status,
      await readResponseError(sourceError, "No access to the selected source location."),
    );
  }

  const destinationError = assertLocationAccess(context, payload.to_location_id);
  if (destinationError) {
    return serviceFail(
      destinationError.status,
      await readResponseError(
        destinationError,
        "No access to the selected destination location.",
      ),
    );
  }

  if (payload.from_location_id === payload.to_location_id) {
    return serviceFail(422, "Transfer source and destination must be different.");
  }

  const productIds = Array.from(new Set(payload.lines.map((line) => line.product_id)));

  const { data: productRows, error: productError } = await context.supabase
    .from("products")
    .select("id, sku, name, barcode")
    .in("id", productIds);

  if (productError) {
    return serviceFail(400, productError.message);
  }

  const productById = new Map(
    ((productRows ?? []) as ProductRow[]).map((product) => [product.id, product]),
  );

  if (productById.size !== productIds.length) {
    return serviceFail(404, "One or more products were not found.");
  }

  const { data: transfer, error: transferError } = await context.supabase
    .from("transfers")
    .insert({
      transfer_number: `TR-${Date.now()}`,
      from_location_id: payload.from_location_id,
      to_location_id: payload.to_location_id,
      status: "REQUESTED",
      notes: payload.notes ?? null,
      requested_by: context.user.id,
    })
    .select("*")
    .single();

  if (transferError || !transfer) {
    return serviceFail(400, transferError?.message ?? "Failed to create transfer.");
  }

  const transferLines = payload.lines.map((line) => {
    const product = productById.get(line.product_id);

    return {
      transfer_id: transfer.id,
      ...line,
      product_sku_snapshot: product?.sku ?? null,
      product_name_snapshot: product?.name ?? null,
      product_barcode_snapshot: product?.barcode ?? null,
      dispatched_qty: 0,
      received_qty: 0,
    };
  });

  let { data: lines, error: linesError } = await context.supabase
    .from("transfer_lines")
    .insert(transferLines)
    .select("*");

  if (isMissingSnapshotColumnError(linesError)) {
    ({ data: lines, error: linesError } = await context.supabase
      .from("transfer_lines")
      .insert(stripSnapshotFieldsFromRows(transferLines))
      .select("*"));
  }

  if (linesError) {
    return serviceFail(400, linesError.message);
  }

  return serviceOk(
    {
      ...transfer,
      lines: lines ?? [],
    },
    201,
  );
}

export async function approveTransfer(context: AuthContext, id: string) {
  const { data: transfer, error: transferError } = await context.supabase
    .from("transfers")
    .select("id, status, from_location_id, to_location_id")
    .eq("id", id)
    .single<{
      id: string;
      status: string;
      from_location_id: string | null;
      to_location_id: string | null;
    }>();

  if (transferError || !transfer) {
    return serviceFail(404, transferError?.message ?? "Transfer not found.");
  }

  const sourceError = assertLocationAccess(
    context,
    transfer.from_location_id as string | null,
  );
  if (sourceError) {
    return serviceFail(
      sourceError.status,
      await readResponseError(sourceError, "No access to the selected source location."),
    );
  }

  const destinationError = assertLocationAccess(
    context,
    transfer.to_location_id as string | null,
  );
  if (destinationError) {
    return serviceFail(
      destinationError.status,
      await readResponseError(
        destinationError,
        "No access to the selected destination location.",
      ),
    );
  }

  if (transfer.status !== "REQUESTED") {
    return serviceFail(409, "Only REQUESTED transfers can be approved.");
  }

  const { data, error } = await context.supabase
    .from("transfers")
    .update({
      status: "APPROVED",
      approved_by: context.user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return serviceFail(400, error.message);
  }

  return serviceOk(data);
}

export async function dispatchTransfer(context: AuthContext, id: string) {
  const { data, error } = await context.supabase.rpc("rpc_dispatch_transfer", {
    p_transfer_id: id,
  });

  if (error) {
    return serviceFail(400, error.message);
  }

  return serviceOk({ success: true, result: data });
}

export async function receiveTransfer(context: AuthContext, id: string) {
  const { data, error } = await context.supabase.rpc("rpc_receive_transfer", {
    p_transfer_id: id,
  });

  if (error) {
    return serviceFail(400, error.message);
  }

  return serviceOk({ success: true, result: data });
}

export async function getTransferSummary(
  context: AuthContext,
  id: string,
): Promise<ServiceResult<TransferSummary>> {
  const { data, error } = await context.supabase
    .from("transfers")
    .select("id, transfer_number, status")
    .eq("id", id)
    .single<TransferSummary>();

  if (error || !data) {
    return serviceFail(error ? 404 : 404, error?.message ?? "Transfer not found.");
  }

  return serviceOk(data);
}

export type { TransferSummary };
