import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const SCRIPT_TAG = "IMSLOAD";
const RNG_SEED = 20260305;
const TOTAL_TRANSACTIONS = 100;
const SUPPLIER_COUNT = 12;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const OPERATIONAL_RESET_TABLES = [
  "supplier_document_payments",
  "supplier_documents",
  "stock_ledger",
  "inventory_transaction_lines",
  "inventory_transactions",
  "inventory_batches",
  "transfer_lines",
  "transfers",
  "alerts",
  "suppliers",
];

const TRANSFER_PAIR_COUNT = 5;

function logInfo(message) {
  console.log(`[workload] ${message}`);
}

function logError(message) {
  console.error(`[workload] ${message}`);
}

function abort(message) {
  logError(message);
  process.exit(1);
}

function assertEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    abort(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomChoice(rng, items) {
  if (items.length === 0) {
    return null;
  }
  return items[randomInt(rng, 0, items.length - 1)];
}

function shuffleInPlace(rng, items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(rng, 0, index);
    const temp = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = temp;
  }
  return next;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function toDateStringUtc(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysUtc(dateOrIso, dayDelta) {
  const date = typeof dateOrIso === "string" ? new Date(`${dateOrIso}T00:00:00.000Z`) : dateOrIso;
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + dayDelta);
  return copy;
}

function toIsoWithTime(dateIso, hours, minutes, seconds) {
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${dateIso}T${hh}:${mm}:${ss}.000Z`;
}

function keyFor(productId, locationId) {
  return `${productId}::${locationId}`;
}

function updateProjectedStock(projectedStock, productId, locationId, delta) {
  const key = keyFor(productId, locationId);
  const current = projectedStock.get(key) ?? 0;
  const next = current + delta;
  if (next < 0) {
    return false;
  }
  if (next === 0) {
    projectedStock.delete(key);
  } else {
    projectedStock.set(key, next);
  }
  return true;
}

function listPositiveProjectedStock(projectedStock) {
  const rows = [];
  for (const [key, qty] of projectedStock.entries()) {
    if (qty <= 0) {
      continue;
    }
    const [productId, locationId] = key.split("::");
    rows.push({ productId, locationId, qty });
  }
  return rows;
}

function buildDateSchedule(total, rng, todayUtcDate) {
  const daysAgo = Array.from({ length: 365 }, (_, index) => index);
  const sampled = shuffleInPlace(rng, daysAgo).slice(0, total);

  const dates = sampled
    .map((offset) => {
      const date = addDaysUtc(todayUtcDate, -offset);
      return toDateStringUtc(date);
    })
    .sort((left, right) => left.localeCompare(right));

  return dates;
}

function buildTypeSequence(enableTransfers) {
  const firstPhase = [
    ...Array(30).fill("RECEIPT"),
    ...Array(10).fill("ADJUSTMENT_INCREASE"),
    ...Array(10).fill("RECEIPT"),
    ...Array(15).fill("ISSUE"),
    ...Array(10).fill("RETURN_OUT"),
  ];

  const transferOrFallback = enableTransfers
    ? Array.from({ length: TRANSFER_PAIR_COUNT * 2 }, (_, index) =>
        index % 2 === 0 ? "TRANSFER_OUT" : "TRANSFER_IN",
      )
    : [...Array(TRANSFER_PAIR_COUNT).fill("ISSUE"), ...Array(TRANSFER_PAIR_COUNT).fill("RECEIPT")];

  const finalPhase = [...Array(5).fill("ISSUE"), ...Array(5).fill("RETURN_OUT"), ...Array(5).fill("ADJUSTMENT_DECREASE")];
  const sequence = [...firstPhase, ...transferOrFallback, ...finalPhase];

  if (sequence.length !== TOTAL_TRANSACTIONS) {
    throw new Error(`Internal sequence length mismatch. Expected ${TOTAL_TRANSACTIONS}, got ${sequence.length}.`);
  }

  return sequence;
}

function nextInvoiceNumber(prefix, index) {
  return `${prefix}-${String(index).padStart(4, "0")}`;
}

function assertNoError(result, context) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
}

function parseOptionalNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

async function deleteAllRows(supabase, table) {
  const result = await supabase.from(table).delete().neq("id", ZERO_UUID);
  assertNoError(result, `Failed clearing table '${table}'`);
}

async function resolveAdminUserId(supabase, adminEmail) {
  let page = 1;
  const perPage = 200;

  while (page <= 50) {
    const usersResult = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (usersResult.error) {
      throw new Error(`Failed listing auth users: ${usersResult.error.message}`);
    }

    const users = usersResult.data?.users ?? [];
    if (users.length === 0) {
      break;
    }

    const match = users.find((user) => user.email?.toLowerCase() === adminEmail.toLowerCase());
    if (match) {
      return match.id;
    }

    page += 1;
  }

  throw new Error(`Could not resolve admin auth user for email '${adminEmail}'.`);
}

async function fetchProfile(supabase, userId) {
  const profileResult = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  assertNoError(profileResult, "Failed reading admin profile");

  if (!profileResult.data) {
    throw new Error(`No profile row found for admin user id '${userId}'.`);
  }
  return profileResult.data;
}

async function fetchMasterData(supabase) {
  const productsResult = await supabase
    .from("products")
    .select("id, sku, name, is_active")
    .eq("is_active", true)
    .order("sku", { ascending: true });
  assertNoError(productsResult, "Failed loading active products");

  const locationsResult = await supabase
    .from("locations")
    .select("id, code, name, is_active")
    .eq("is_active", true)
    .order("code", { ascending: true });
  assertNoError(locationsResult, "Failed loading active locations");

  const products = productsResult.data ?? [];
  const locations = locationsResult.data ?? [];

  if (products.length < 1) {
    throw new Error("Active products are required. Found zero active products.");
  }
  if (locations.length < 1) {
    throw new Error("Active locations are required. Found zero active locations.");
  }

  return { products, locations };
}

function buildUnitCostMap(products) {
  const map = new Map();
  products.forEach((product, index) => {
    const base = round2(1.75 + index * 0.63);
    map.set(product.id, base);
  });
  return map;
}

function chooseOutboundCandidate(rng, projectedStock, minQty = 1) {
  const candidates = listPositiveProjectedStock(projectedStock).filter((row) => row.qty >= minQty);
  return randomChoice(rng, candidates);
}

function chooseTransferDestination(rng, locations, sourceLocationId) {
  const options = locations.filter((location) => location.id !== sourceLocationId);
  return randomChoice(rng, options);
}

function buildTransactionSpecs({
  rng,
  dates,
  types,
  products,
  locations,
  suppliers,
  unitCostByProduct,
  enableTransfers,
}) {
  const specs = [];
  const projectedStock = new Map();
  const pendingTransfers = [];

  let receiptInvoiceCounter = 1;
  let returnInvoiceCounter = 1;
  let transferPairCounter = 1;

  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index];
    const kind = types[index];
    const createdAt = toIsoWithTime(date, 9, (index * 7) % 60, 0);
    const submittedAt = toIsoWithTime(date, 10, (index * 7 + 5) % 60, 0);
    const postedAt = toIsoWithTime(date, 11, (index * 7 + 10) % 60, 0);
    const txNumber = `${SCRIPT_TAG}-TX-${String(index + 1).padStart(4, "0")}`;

    const fallbackError = `Unable to construct transaction spec #${index + 1} (${kind}).`;
    let spec = null;

    if (kind === "RECEIPT") {
      const product = randomChoice(rng, products);
      const location = randomChoice(rng, locations);
      const supplier = randomChoice(rng, suppliers);
      const qty = randomInt(rng, 18, 46);
      const unitCost = round2((unitCostByProduct.get(product.id) ?? 1.5) + randomInt(rng, 0, 120) / 100);
      const lotNumber = `${SCRIPT_TAG}-LOT-R-${String(index + 1).padStart(4, "0")}`;
      const expiryDate = toDateStringUtc(addDaysUtc(date, randomInt(rng, 120, 320)));
      updateProjectedStock(projectedStock, product.id, location.id, qty);

      spec = {
        index: index + 1,
        kind,
        type: "RECEIPT",
        txNumber,
        date,
        createdAt,
        submittedAt,
        postedAt,
        sourceLocationId: null,
        destinationLocationId: location.id,
        supplierId: supplier.id,
        supplierInvoiceNumber: nextInvoiceNumber("IMSINV", receiptInvoiceCounter),
        supplierInvoiceDate: date,
        notes: `${SCRIPT_TAG} generated receipt`,
        line: {
          productId: product.id,
          qty,
          unitCost,
          lotNumber,
          expiryDate,
          reasonCode: null,
        },
      };
      receiptInvoiceCounter += 1;
    } else if (kind === "ADJUSTMENT_INCREASE") {
      const product = randomChoice(rng, products);
      const location = randomChoice(rng, locations);
      const qty = randomInt(rng, 8, 22);
      const unitCost = round2((unitCostByProduct.get(product.id) ?? 1.5) + randomInt(rng, 0, 90) / 100);
      const lotNumber = `${SCRIPT_TAG}-LOT-AI-${String(index + 1).padStart(4, "0")}`;
      const expiryDate = toDateStringUtc(addDaysUtc(date, randomInt(rng, 90, 260)));
      updateProjectedStock(projectedStock, product.id, location.id, qty);

      spec = {
        index: index + 1,
        kind,
        type: "ADJUSTMENT",
        txNumber,
        date,
        createdAt,
        submittedAt,
        postedAt,
        sourceLocationId: null,
        destinationLocationId: location.id,
        supplierId: null,
        supplierInvoiceNumber: null,
        supplierInvoiceDate: null,
        notes: `${SCRIPT_TAG} adjustment increase`,
        line: {
          productId: product.id,
          qty,
          unitCost,
          lotNumber,
          expiryDate,
          reasonCode: "INCREASE",
        },
      };
    } else if (kind === "ISSUE") {
      const candidate = chooseOutboundCandidate(rng, projectedStock, 2);
      if (!candidate) {
        throw new Error(`${fallbackError} No projected stock available for ISSUE.`);
      }
      const qty = Math.min(candidate.qty, randomInt(rng, 2, 14));
      if (!updateProjectedStock(projectedStock, candidate.productId, candidate.locationId, -qty)) {
        throw new Error(`${fallbackError} Projected stock underflow for ISSUE.`);
      }

      spec = {
        index: index + 1,
        kind,
        type: "ISSUE",
        txNumber,
        date,
        createdAt,
        submittedAt,
        postedAt,
        sourceLocationId: candidate.locationId,
        destinationLocationId: null,
        supplierId: null,
        supplierInvoiceNumber: null,
        supplierInvoiceDate: null,
        notes: `${SCRIPT_TAG} generated issue`,
        line: {
          productId: candidate.productId,
          qty,
          unitCost: null,
          lotNumber: null,
          expiryDate: null,
          reasonCode: null,
        },
      };
    } else if (kind === "RETURN_OUT") {
      const candidate = chooseOutboundCandidate(rng, projectedStock, 2);
      if (!candidate) {
        throw new Error(`${fallbackError} No projected stock available for RETURN_OUT.`);
      }
      const supplier = randomChoice(rng, suppliers);
      const qty = Math.min(candidate.qty, randomInt(rng, 2, 11));
      const unitCost = round2((unitCostByProduct.get(candidate.productId) ?? 1.5) + randomInt(rng, 10, 140) / 100);
      if (!updateProjectedStock(projectedStock, candidate.productId, candidate.locationId, -qty)) {
        throw new Error(`${fallbackError} Projected stock underflow for RETURN_OUT.`);
      }

      spec = {
        index: index + 1,
        kind,
        type: "RETURN_OUT",
        txNumber,
        date,
        createdAt,
        submittedAt,
        postedAt,
        sourceLocationId: candidate.locationId,
        destinationLocationId: null,
        supplierId: supplier.id,
        supplierInvoiceNumber: nextInvoiceNumber("IMSCRN", returnInvoiceCounter),
        supplierInvoiceDate: date,
        notes: `${SCRIPT_TAG} generated purchase return`,
        line: {
          productId: candidate.productId,
          qty,
          unitCost,
          lotNumber: null,
          expiryDate: null,
          reasonCode: null,
        },
      };
      returnInvoiceCounter += 1;
    } else if (kind === "ADJUSTMENT_DECREASE") {
      const candidate = chooseOutboundCandidate(rng, projectedStock, 1);
      if (!candidate) {
        throw new Error(`${fallbackError} No projected stock available for ADJUSTMENT_DECREASE.`);
      }
      const qty = Math.min(candidate.qty, randomInt(rng, 1, 7));
      if (!updateProjectedStock(projectedStock, candidate.productId, candidate.locationId, -qty)) {
        throw new Error(`${fallbackError} Projected stock underflow for ADJUSTMENT_DECREASE.`);
      }

      spec = {
        index: index + 1,
        kind,
        type: "ADJUSTMENT",
        txNumber,
        date,
        createdAt,
        submittedAt,
        postedAt,
        sourceLocationId: candidate.locationId,
        destinationLocationId: null,
        supplierId: null,
        supplierInvoiceNumber: null,
        supplierInvoiceDate: null,
        notes: `${SCRIPT_TAG} adjustment decrease`,
        line: {
          productId: candidate.productId,
          qty,
          unitCost: null,
          lotNumber: null,
          expiryDate: null,
          reasonCode: "DECREASE",
        },
      };
    } else if (kind === "TRANSFER_OUT") {
      if (!enableTransfers) {
        throw new Error(`${fallbackError} Transfer sequence generated while transfers are disabled.`);
      }
      const candidate = chooseOutboundCandidate(rng, projectedStock, 2);
      if (!candidate) {
        throw new Error(`${fallbackError} No projected stock available for TRANSFER_OUT.`);
      }
      const destination = chooseTransferDestination(rng, locations, candidate.locationId);
      if (!destination) {
        throw new Error(`${fallbackError} Could not resolve transfer destination.`);
      }
      const qty = Math.min(candidate.qty, randomInt(rng, 2, 9));
      if (!updateProjectedStock(projectedStock, candidate.productId, candidate.locationId, -qty)) {
        throw new Error(`${fallbackError} Projected stock underflow for TRANSFER_OUT.`);
      }

      pendingTransfers.push({
        pairNumber: transferPairCounter,
        productId: candidate.productId,
        qty,
        sourceLocationId: candidate.locationId,
        destinationLocationId: destination.id,
      });

      spec = {
        index: index + 1,
        kind,
        type: "TRANSFER_OUT",
        txNumber,
        date,
        createdAt,
        submittedAt,
        postedAt,
        sourceLocationId: candidate.locationId,
        destinationLocationId: destination.id,
        supplierId: null,
        supplierInvoiceNumber: null,
        supplierInvoiceDate: null,
        notes: `${SCRIPT_TAG} transfer pair ${String(transferPairCounter).padStart(2, "0")} outbound`,
        line: {
          productId: candidate.productId,
          qty,
          unitCost: null,
          lotNumber: null,
          expiryDate: null,
          reasonCode: "TRANSFER_DISPATCH",
        },
      };
      transferPairCounter += 1;
    } else if (kind === "TRANSFER_IN") {
      if (!enableTransfers) {
        throw new Error(`${fallbackError} Transfer sequence generated while transfers are disabled.`);
      }
      const pending = pendingTransfers.shift();
      if (!pending) {
        throw new Error(`${fallbackError} Missing pending transfer pair for TRANSFER_IN.`);
      }
      const unitCost = round2((unitCostByProduct.get(pending.productId) ?? 1.5) + randomInt(rng, 5, 85) / 100);
      const lotNumber = `${SCRIPT_TAG}-LOT-TI-${String(pending.pairNumber).padStart(2, "0")}`;
      const expiryDate = toDateStringUtc(addDaysUtc(date, randomInt(rng, 110, 280)));
      updateProjectedStock(projectedStock, pending.productId, pending.destinationLocationId, pending.qty);

      spec = {
        index: index + 1,
        kind,
        type: "TRANSFER_IN",
        txNumber,
        date,
        createdAt,
        submittedAt,
        postedAt,
        sourceLocationId: pending.sourceLocationId,
        destinationLocationId: pending.destinationLocationId,
        supplierId: null,
        supplierInvoiceNumber: null,
        supplierInvoiceDate: null,
        notes: `${SCRIPT_TAG} transfer pair ${String(pending.pairNumber).padStart(2, "0")} inbound`,
        line: {
          productId: pending.productId,
          qty: pending.qty,
          unitCost,
          lotNumber,
          expiryDate,
          reasonCode: "TRANSFER_RECEIVE",
        },
      };
    } else {
      throw new Error(`Unsupported generated transaction kind '${kind}'.`);
    }

    if (!spec) {
      throw new Error(fallbackError);
    }
    specs.push(spec);
  }

  if (pendingTransfers.length > 0) {
    throw new Error(`Internal transfer pairing mismatch. Pending pairs: ${pendingTransfers.length}.`);
  }

  return specs;
}

async function insertTransactionDraft(supabase, spec, adminUserId) {
  const txPayload = {
    tx_number: spec.txNumber,
    type: spec.type,
    status: "DRAFT",
    source_location_id: spec.sourceLocationId,
    destination_location_id: spec.destinationLocationId,
    supplier_id: spec.supplierId,
    supplier_invoice_number: spec.supplierInvoiceNumber,
    supplier_invoice_date: spec.supplierInvoiceDate,
    notes: spec.notes,
    created_by: adminUserId,
    created_at: spec.createdAt,
    updated_at: spec.createdAt,
  };

  const txResult = await supabase
    .from("inventory_transactions")
    .insert(txPayload)
    .select("id, tx_number, type, status, source_location_id, destination_location_id")
    .single();
  assertNoError(txResult, `Failed inserting draft transaction '${spec.txNumber}'`);

  const linePayload = {
    transaction_id: txResult.data.id,
    product_id: spec.line.productId,
    qty: spec.line.qty,
    unit_cost: spec.line.unitCost,
    lot_number: spec.line.lotNumber,
    expiry_date: spec.line.expiryDate,
    reason_code: spec.line.reasonCode,
    created_at: spec.createdAt,
    updated_at: spec.createdAt,
  };

  const lineResult = await supabase
    .from("inventory_transaction_lines")
    .insert(linePayload)
    .select("id, product_id, qty, unit_cost, lot_number, expiry_date, reason_code")
    .single();
  assertNoError(lineResult, `Failed inserting line for transaction '${spec.txNumber}'`);

  return {
    transaction: txResult.data,
    line: lineResult.data,
  };
}

async function upsertInboundBatchAndLedger({
  supabase,
  transactionId,
  line,
  locationId,
  occurredAtIso,
  actorUserId,
}) {
  const batchPayload = {
    product_id: line.product_id,
    location_id: locationId,
    lot_number: line.lot_number,
    expiry_date: line.expiry_date,
    received_at: occurredAtIso,
    qty_on_hand: line.qty,
    unit_cost: line.unit_cost,
    updated_at: occurredAtIso,
  };

  const batchResult = await supabase
    .from("inventory_batches")
    .upsert(batchPayload, {
      onConflict: "product_id,location_id,lot_number,expiry_date",
    })
    .select("id, product_id, location_id, qty_on_hand, unit_cost")
    .single();
  assertNoError(batchResult, `Failed upserting inbound batch for transaction '${transactionId}'`);

  const ledgerResult = await supabase.from("stock_ledger").insert({
    transaction_line_id: line.id,
    product_id: line.product_id,
    location_id: locationId,
    batch_id: batchResult.data.id,
    direction: "IN",
    qty: line.qty,
    occurred_at: occurredAtIso,
    created_by: actorUserId,
  });
  assertNoError(ledgerResult, `Failed inserting IN ledger row for transaction '${transactionId}'`);
}

async function consumeOutboundBatchesFefo({
  supabase,
  transactionId,
  line,
  sourceLocationId,
  occurredAtIso,
  actorUserId,
}) {
  let remaining = line.qty;

  const batchesResult = await supabase
    .from("inventory_batches")
    .select("id, qty_on_hand, expiry_date, received_at")
    .eq("product_id", line.product_id)
    .eq("location_id", sourceLocationId)
    .gt("qty_on_hand", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("received_at", { ascending: true });
  assertNoError(batchesResult, `Failed loading FEFO batches for transaction '${transactionId}'`);

  const batches = batchesResult.data ?? [];
  for (const batch of batches) {
    if (remaining <= 0) {
      break;
    }
    const currentQty = parseOptionalNumber(batch.qty_on_hand, 0);
    if (currentQty <= 0) {
      continue;
    }

    const take = Math.min(currentQty, remaining);
    const nextQty = currentQty - take;

    const updateResult = await supabase
      .from("inventory_batches")
      .update({
        qty_on_hand: nextQty,
        updated_at: occurredAtIso,
      })
      .eq("id", batch.id);
    assertNoError(updateResult, `Failed decrementing batch '${batch.id}' for transaction '${transactionId}'`);

    const ledgerResult = await supabase.from("stock_ledger").insert({
      transaction_line_id: line.id,
      product_id: line.product_id,
      location_id: sourceLocationId,
      batch_id: batch.id,
      direction: "OUT",
      qty: take,
      occurred_at: occurredAtIso,
      created_by: actorUserId,
    });
    assertNoError(ledgerResult, `Failed inserting OUT ledger row for transaction '${transactionId}'`);

    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(
      `Insufficient stock while posting transaction '${transactionId}'. Missing qty: ${remaining}.`,
    );
  }
}

async function setTransactionPosted({
  supabase,
  transactionId,
  actorUserId,
  submittedAtIso,
  postedAtIso,
}) {
  const result = await supabase
    .from("inventory_transactions")
    .update({
      status: "POSTED",
      submitted_by: actorUserId,
      posted_by: actorUserId,
      submitted_at: submittedAtIso,
      posted_at: postedAtIso,
      updated_at: postedAtIso,
    })
    .eq("id", transactionId)
    .select("id, type, status, posted_at")
    .single();
  assertNoError(result, `Failed setting POSTED status for transaction '${transactionId}'`);
  return result.data;
}

async function postDraftTransaction({
  supabase,
  draft,
  spec,
  actorUserId,
}) {
  const isInbound =
    draft.transaction.type === "RECEIPT" ||
    draft.transaction.type === "RETURN_IN" ||
    draft.transaction.type === "TRANSFER_IN" ||
    (draft.transaction.type === "ADJUSTMENT" && draft.line.reason_code !== "DECREASE") ||
    draft.transaction.type === "CYCLE_COUNT";

  if (isInbound) {
    const targetLocationId = draft.transaction.destination_location_id ?? draft.transaction.source_location_id;
    if (!targetLocationId) {
      throw new Error(`Inbound transaction '${draft.transaction.id}' is missing target location.`);
    }

    await upsertInboundBatchAndLedger({
      supabase,
      transactionId: draft.transaction.id,
      line: draft.line,
      locationId: targetLocationId,
      occurredAtIso: spec.postedAt,
      actorUserId,
    });
  } else {
    const sourceLocationId = draft.transaction.source_location_id ?? draft.transaction.destination_location_id;
    if (!sourceLocationId) {
      throw new Error(`Outbound transaction '${draft.transaction.id}' is missing source location.`);
    }

    await consumeOutboundBatchesFefo({
      supabase,
      transactionId: draft.transaction.id,
      line: draft.line,
      sourceLocationId,
      occurredAtIso: spec.postedAt,
      actorUserId,
    });
  }

  return setTransactionPosted({
    supabase,
    transactionId: draft.transaction.id,
    actorUserId,
    submittedAtIso: spec.submittedAt,
    postedAtIso: spec.postedAt,
  });
}

async function createSupplierDocuments({
  supabase,
  postedRows,
  actorUserId,
}) {
  const documents = [];

  for (const row of postedRows) {
    const { spec, draft } = row;
    if (spec.type !== "RECEIPT" && spec.type !== "RETURN_OUT") {
      continue;
    }

    const documentType = spec.type === "RECEIPT" ? "INVOICE" : "CREDIT_NOTE";
    const locationId = spec.type === "RECEIPT" ? spec.destinationLocationId : spec.sourceLocationId;
    if (!locationId) {
      throw new Error(`Missing location for supplier document transaction '${draft.transaction.id}'.`);
    }
    if (!spec.supplierId || !spec.supplierInvoiceNumber) {
      throw new Error(`Missing supplier metadata for '${spec.txNumber}'.`);
    }

    const grossAmount = round2(spec.line.qty * parseOptionalNumber(spec.line.unitCost, 0));
    const insertResult = await supabase
      .from("supplier_documents")
      .insert({
        supplier_id: spec.supplierId,
        location_id: locationId,
        source_transaction_id: draft.transaction.id,
        document_type: documentType,
        document_number: spec.supplierInvoiceNumber,
        document_date: spec.date,
        currency: "KWD",
        gross_amount: grossAmount,
        status: "OPEN",
        created_by: actorUserId,
        created_at: spec.postedAt,
        updated_at: spec.postedAt,
      })
      .select("id, supplier_id, document_type, document_number, document_date, gross_amount, status")
      .single();
    assertNoError(insertResult, `Failed inserting supplier document for '${spec.txNumber}'`);

    documents.push(insertResult.data);
  }

  return documents;
}

function buildPaymentPlan({ rng, invoices }) {
  if (invoices.length === 0) {
    return [];
  }

  const shuffled = shuffleInPlace(rng, invoices);
  const targetCount = Math.max(1, Math.round(invoices.length * 0.4));
  const selected = shuffled.slice(0, targetCount);
  let paymentSequence = 1;
  const todayIso = toDateStringUtc(new Date());
  const payments = [];

  for (const invoice of selected) {
    const gross = parseOptionalNumber(invoice.gross_amount, 0);
    if (gross <= 0) {
      continue;
    }

    const totalPaidTarget = round2(gross * (0.3 + rng() * 0.5));
    if (totalPaidTarget <= 0) {
      continue;
    }

    const splitCount = rng() < 0.45 ? 2 : 1;
    const firstAmount =
      splitCount === 2 ? round2(totalPaidTarget * (0.4 + rng() * 0.2)) : totalPaidTarget;
    const secondAmount = splitCount === 2 ? round2(totalPaidTarget - firstAmount) : 0;
    const baseDate = invoice.document_date;
    const daysWindow = Math.max(
      0,
      Math.min(
        120,
        Math.floor((new Date(`${todayIso}T00:00:00.000Z`).getTime() - new Date(`${baseDate}T00:00:00.000Z`).getTime()) / (24 * 60 * 60 * 1000)),
      ),
    );

    const firstDate = toDateStringUtc(addDaysUtc(baseDate, randomInt(rng, 0, Math.max(daysWindow, 1))));
    payments.push({
      supplier_document_id: invoice.id,
      payment_number: `${SCRIPT_TAG}-PAY-${String(paymentSequence).padStart(4, "0")}`,
      payment_date: firstDate,
      amount: firstAmount,
      note: `${SCRIPT_TAG} partial payment`,
    });
    paymentSequence += 1;

    if (splitCount === 2 && secondAmount > 0) {
      const secondDate = toDateStringUtc(addDaysUtc(baseDate, randomInt(rng, 0, Math.max(daysWindow, 1))));
      payments.push({
        supplier_document_id: invoice.id,
        payment_number: `${SCRIPT_TAG}-PAY-${String(paymentSequence).padStart(4, "0")}`,
        payment_date: secondDate,
        amount: secondAmount,
        note: `${SCRIPT_TAG} follow-up partial payment`,
      });
      paymentSequence += 1;
    }
  }

  return payments;
}

async function insertPayments({ supabase, paymentPlan, actorUserId }) {
  const insertedPayments = [];
  for (const payment of paymentPlan) {
    if (payment.amount <= 0) {
      continue;
    }

    const insertResult = await supabase
      .from("supplier_document_payments")
      .insert({
        supplier_document_id: payment.supplier_document_id,
        payment_number: payment.payment_number,
        payment_date: payment.payment_date,
        amount: payment.amount,
        note: payment.note,
        created_by: actorUserId,
      })
      .select("id, supplier_document_id, payment_number, payment_date, amount")
      .single();
    assertNoError(insertResult, `Failed inserting payment '${payment.payment_number}'`);
    insertedPayments.push(insertResult.data);
  }
  return insertedPayments;
}

function summarizeDistribution(specs) {
  const summary = {};
  for (const spec of specs) {
    summary[spec.type] = (summary[spec.type] ?? 0) + 1;
  }
  return summary;
}

async function writeArtifactFile(filename, payload) {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  const targetPath = path.join(artifactsDir, filename);
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return targetPath;
}

async function main() {
  const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  const adminEmail = assertEnv("IMS_ADMIN_EMAIL");
  const destructiveResetFlag = process.env.IMS_ALLOW_DESTRUCTIVE_RESET;

  if (destructiveResetFlag !== "true") {
    abort("IMS_ALLOW_DESTRUCTIVE_RESET must be exactly 'true' to run this script.");
  }

  let targetHost = "(unknown)";
  try {
    targetHost = new URL(supabaseUrl).host;
  } catch {
    abort("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL.");
  }

  logInfo(`Target Supabase host: ${targetHost}`);
  logInfo(`Using deterministic RNG seed: ${RNG_SEED}`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adminUserId = await resolveAdminUserId(supabase, adminEmail);
  const profile = await fetchProfile(supabase, adminUserId);
  if (profile.role !== "admin") {
    abort(`Profile for '${adminEmail}' is not admin. Found role '${profile.role}'.`);
  }
  if (!profile.is_active) {
    abort(`Profile for '${adminEmail}' is inactive.`);
  }
  logInfo(`Resolved admin user id: ${adminUserId}`);

  const { products, locations } = await fetchMasterData(supabase);
  const enableTransfers = locations.length >= 2;
  if (!enableTransfers) {
    logInfo("Less than two active locations found. Transfer pairs will be replaced by issue/receipt pairs.");
  }

  for (const table of OPERATIONAL_RESET_TABLES) {
    logInfo(`Clearing table '${table}' ...`);
    await deleteAllRows(supabase, table);
  }
  logInfo("Operational data reset completed.");

  const nowIso = new Date().toISOString();
  const suppliersPayload = Array.from({ length: SUPPLIER_COUNT }, (_, index) => ({
    code: `${SCRIPT_TAG}-SUP-${String(index + 1).padStart(2, "0")}`,
    name: `${SCRIPT_TAG} Supplier ${String(index + 1).padStart(2, "0")}`,
    phone: `+9657000${String(index + 1).padStart(4, "0")}`,
    email: `imsload-supplier-${String(index + 1).padStart(2, "0")}@example.local`,
    is_active: true,
    created_at: nowIso,
    updated_at: nowIso,
  }));

  const suppliersResult = await supabase
    .from("suppliers")
    .insert(suppliersPayload)
    .select("id, code, name")
    .order("code", { ascending: true });
  assertNoError(suppliersResult, "Failed inserting suppliers");

  const suppliers = (suppliersResult.data ?? []).sort((left, right) => left.code.localeCompare(right.code));
  if (suppliers.length !== SUPPLIER_COUNT) {
    abort(`Supplier insert mismatch. Expected ${SUPPLIER_COUNT}, got ${suppliers.length}.`);
  }

  const rng = mulberry32(RNG_SEED);
  const todayIso = toDateStringUtc(new Date());
  const todayUtcDate = new Date(`${todayIso}T00:00:00.000Z`);
  const dates = buildDateSchedule(TOTAL_TRANSACTIONS, rng, todayUtcDate);
  const typeSequence = buildTypeSequence(enableTransfers);
  const unitCostByProduct = buildUnitCostMap(products);

  const specs = buildTransactionSpecs({
    rng,
    dates,
    types: typeSequence,
    products,
    locations,
    suppliers,
    unitCostByProduct,
    enableTransfers,
  });

  const postedRows = [];
  for (const spec of specs) {
    const draft = await insertTransactionDraft(supabase, spec, adminUserId);
    await postDraftTransaction({
      supabase,
      draft,
      spec,
      actorUserId: adminUserId,
    });
    postedRows.push({ spec, draft });
  }
  logInfo(`Inserted and posted ${postedRows.length} transactions.`);

  const documents = await createSupplierDocuments({
    supabase,
    postedRows,
    actorUserId: adminUserId,
  });

  const invoiceDocuments = documents.filter((document) => document.document_type === "INVOICE");
  const paymentPlan = buildPaymentPlan({
    rng,
    invoices: invoiceDocuments,
  });
  const payments = await insertPayments({
    supabase,
    paymentPlan,
    actorUserId: adminUserId,
  });

  const refreshResult = await supabase.rpc("rpc_refresh_alerts");
  assertNoError(refreshResult, "Failed running rpc_refresh_alerts()");

  const supplierDocumentCounts = documents.reduce(
    (accumulator, document) => {
      if (document.document_type === "INVOICE") {
        accumulator.invoices += 1;
      } else if (document.document_type === "CREDIT_NOTE") {
        accumulator.credit_notes += 1;
      }
      return accumulator;
    },
    { invoices: 0, credit_notes: 0 },
  );

  const summary = {
    generated_at: new Date().toISOString(),
    seed: RNG_SEED,
    target_host: targetHost,
    total_transactions: postedRows.length,
    total_suppliers: suppliers.length,
    type_distribution: summarizeDistribution(specs),
    distinct_transaction_dates: new Set(specs.map((spec) => spec.date)).size,
    min_date: specs[0]?.date ?? null,
    max_date: specs[specs.length - 1]?.date ?? null,
    supplier_documents: {
      total: documents.length,
      invoices: supplierDocumentCounts.invoices,
      credit_notes: supplierDocumentCounts.credit_notes,
    },
    supplier_payments: {
      total: payments.length,
      total_amount: round2(payments.reduce((sum, row) => sum + parseOptionalNumber(row.amount), 0)),
    },
    generated_ids: {
      transaction_ids: postedRows.map((row) => row.draft.transaction.id),
      supplier_ids: suppliers.map((supplier) => supplier.id),
      supplier_document_ids: documents.map((document) => document.id),
      supplier_payment_ids: payments.map((payment) => payment.id),
    },
  };

  const artifactPath = await writeArtifactFile("workload-summary.json", summary);
  logInfo(`Wrote workload artifact: ${artifactPath}`);
  logInfo("Workload generation complete.");
}

main().catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
