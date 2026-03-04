import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const SCRIPT_TAG = "IMSLOAD";
const DEFAULT_BASE_URL = "http://localhost:3000";
const SUMMARY_ARTIFACT_PATH = path.join(process.cwd(), "artifacts", "workload-summary.json");

function logInfo(message) {
  console.log(`[report-check] ${message}`);
}

function logError(message) {
  console.error(`[report-check] ${message}`);
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

function round2(value) {
  return Math.round(value * 100) / 100;
}

function toDateStringUtc(date) {
  return date.toISOString().slice(0, 10);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toleranceEqual(left, right, tolerance = 0.01) {
  return Math.abs(left - right) <= tolerance;
}

function readSetCookieLines(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const raw = headers.get("set-cookie");
  if (!raw) {
    return [];
  }

  return raw.split(/,(?=[^;]+=[^;]+)/g);
}

function mergeCookieJar(cookieJar, response) {
  const setCookieLines = readSetCookieLines(response.headers);
  for (const line of setCookieLines) {
    const [pair] = line.split(";");
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }
    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    cookieJar.set(name, value);
  }
}

function cookieHeader(cookieJar) {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function apiRequest({
  baseUrl,
  method = "GET",
  route,
  cookieJar,
  body,
  expectJson = true,
}) {
  const headers = {
    Accept: expectJson ? "application/json" : "*/*",
  };

  const cookie = cookieHeader(cookieJar);
  if (cookie) {
    headers.Cookie = cookie;
  }

  let serializedBody = undefined;
  if (body !== undefined) {
    serializedBody = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: serializedBody,
    redirect: "manual",
  });

  mergeCookieJar(cookieJar, response);

  const text = await response.text();
  let json = null;
  if (expectJson && text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const message = json?.error || text || `Request failed (${response.status})`;
    throw new Error(`${method} ${route} failed (${response.status}): ${message}`);
  }

  return {
    status: response.status,
    text,
    json,
  };
}

async function loadSummaryArtifact() {
  try {
    const text = await fs.readFile(SUMMARY_ARTIFACT_PATH, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function writeArtifact(filename, payload) {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  const filePath = path.join(artifactsDir, filename);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}

function summarizeSupplierFromDb(documents, payments) {
  const paidByDocument = new Map();
  for (const payment of payments) {
    const current = paidByDocument.get(payment.supplier_document_id) ?? 0;
    paidByDocument.set(payment.supplier_document_id, current + toNumber(payment.amount));
  }

  let totalInvoiced = 0;
  let totalCredits = 0;
  let totalPaid = 0;

  for (const document of documents) {
    if (document.status === "VOID") {
      continue;
    }
    const gross = toNumber(document.gross_amount);
    if (document.document_type === "INVOICE") {
      totalInvoiced += gross;
      totalPaid += paidByDocument.get(document.id) ?? 0;
    } else if (document.document_type === "CREDIT_NOTE") {
      totalCredits += gross;
    }
  }

  return {
    total_invoiced: round2(totalInvoiced),
    total_credits: round2(totalCredits),
    total_paid: round2(totalPaid),
    net_pending: round2(totalInvoiced - totalCredits - totalPaid),
  };
}

async function main() {
  const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  const adminEmail = assertEnv("IMS_ADMIN_EMAIL");
  const adminPassword = assertEnv("IMS_ADMIN_PASSWORD");
  const baseUrl = (process.env.IMS_APP_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const workloadSummary = await loadSummaryArtifact();
  if (!workloadSummary) {
    logInfo("workload-summary.json not found; running checks with computed expectations.");
  }

  const today = new Date();
  const todayIso = toDateStringUtc(today);
  const start365 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start365.setUTCDate(start365.getUTCDate() - 364);
  const start365Iso = toDateStringUtc(start365);

  const cookieJar = new Map();
  const loginResult = await apiRequest({
    baseUrl,
    method: "POST",
    route: "/api/auth/login",
    cookieJar,
    body: {
      email: adminEmail,
      password: adminPassword,
    },
    expectJson: true,
  });
  if (!loginResult.json?.success) {
    throw new Error("Login did not return success=true.");
  }
  logInfo("Authenticated admin API session.");

  const productMovementResult = await supabase
    .from("stock_ledger")
    .select("product_id, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(1);
  if (productMovementResult.error) {
    throw new Error(`Failed selecting product for report checks: ${productMovementResult.error.message}`);
  }
  const selectedProductId = productMovementResult.data?.[0]?.product_id;
  if (!selectedProductId) {
    throw new Error("No stock_ledger activity found to select product for item reports.");
  }

  const apiResults = {};

  apiResults.dashboard = await apiRequest({
    baseUrl,
    route: "/api/reports/dashboard",
    cookieJar,
  });

  apiResults.stockSummary = await apiRequest({
    baseUrl,
    route: `/api/reports/stock-summary?as_of_date=${todayIso}`,
    cookieJar,
  });

  apiResults.supplier = await apiRequest({
    baseUrl,
    route: `/api/reports/supplier?from_date=${start365Iso}&to_date=${todayIso}`,
    cookieJar,
  });

  apiResults.itemStatement = await apiRequest({
    baseUrl,
    route: `/api/reports/item-statement?product_id=${selectedProductId}&from_date=${start365Iso}&to_date=${todayIso}`,
    cookieJar,
  });

  apiResults.itemCostEvolution = await apiRequest({
    baseUrl,
    route: `/api/reports/item-cost-evolution?product_id=${selectedProductId}&from_date=${start365Iso}&to_date=${todayIso}`,
    cookieJar,
  });

  apiResults.exportTransactions = await apiRequest({
    baseUrl,
    route: "/api/reports/export?entity=transactions",
    cookieJar,
    expectJson: false,
  });

  apiResults.exportSupplier = await apiRequest({
    baseUrl,
    route: `/api/reports/export?entity=supplier&from_date=${start365Iso}&to_date=${todayIso}`,
    cookieJar,
    expectJson: false,
  });

  const txResult = await supabase
    .from("inventory_transactions")
    .select("id, tx_number, type, status, posted_at");
  if (txResult.error) {
    throw new Error(`Failed reading transactions for DB checks: ${txResult.error.message}`);
  }

  const generatedTransactions = (txResult.data ?? []).filter((row) =>
    String(row.tx_number ?? "").startsWith(`${SCRIPT_TAG}-TX-`),
  );
  const postedTransactions = generatedTransactions.filter((row) => row.status === "POSTED");

  const distribution = postedTransactions.reduce((accumulator, row) => {
    accumulator[row.type] = (accumulator[row.type] ?? 0) + 1;
    return accumulator;
  }, {});

  const distinctPostedDates = new Set(
    postedTransactions
      .map((row) => String(row.posted_at ?? "").slice(0, 10))
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
  );

  const supplierResult = await supabase
    .from("suppliers")
    .select("id, code")
    .like("code", `${SCRIPT_TAG}-SUP-%`);
  if (supplierResult.error) {
    throw new Error(`Failed reading generated suppliers: ${supplierResult.error.message}`);
  }

  const documentResult = await supabase
    .from("supplier_documents")
    .select("id, document_type, gross_amount, status, document_number")
    .or("document_number.like.IMSINV-%,document_number.like.IMSCRN-%");
  if (documentResult.error) {
    throw new Error(`Failed reading generated supplier documents: ${documentResult.error.message}`);
  }

  const paymentResult = await supabase
    .from("supplier_document_payments")
    .select("id, supplier_document_id, amount, payment_number")
    .like("payment_number", `${SCRIPT_TAG}-PAY-%`);
  if (paymentResult.error) {
    throw new Error(`Failed reading generated supplier payments: ${paymentResult.error.message}`);
  }

  const dbSupplierSummary = summarizeSupplierFromDb(documentResult.data ?? [], paymentResult.data ?? []);
  const apiSupplierSummary = apiResults.supplier.json?.summary ?? {};

  const checks = {
    posted_transaction_count_is_100: postedTransactions.length === 100,
    distinct_posted_dates_is_100: distinctPostedDates.size === 100,
    generated_suppliers_is_12: (supplierResult.data ?? []).length === 12,
    stock_summary_has_rows:
      (apiResults.stockSummary.json?.details?.length ?? 0) > 0 ||
      (apiResults.stockSummary.json?.totals?.length ?? 0) > 0,
    item_statement_has_rows: (apiResults.itemStatement.json?.rows?.length ?? 0) > 0,
    item_cost_evolution_has_rows: (apiResults.itemCostEvolution.json?.rows?.length ?? 0) > 0,
    transactions_export_is_csv:
      apiResults.exportTransactions.text.includes(",") && apiResults.exportTransactions.text.trim().length > 0,
    supplier_export_is_csv:
      apiResults.exportSupplier.text.includes(",") && apiResults.exportSupplier.text.trim().length > 0,
    supplier_summary_total_invoiced_match: toleranceEqual(
      toNumber(apiSupplierSummary.total_invoiced),
      dbSupplierSummary.total_invoiced,
      0.01,
    ),
    supplier_summary_total_credits_match: toleranceEqual(
      toNumber(apiSupplierSummary.total_credits),
      dbSupplierSummary.total_credits,
      0.01,
    ),
    supplier_summary_total_paid_match: toleranceEqual(
      toNumber(apiSupplierSummary.total_paid),
      dbSupplierSummary.total_paid,
      0.01,
    ),
    supplier_summary_net_pending_match: toleranceEqual(
      toNumber(apiSupplierSummary.net_pending),
      dbSupplierSummary.net_pending,
      0.01,
    ),
  };

  if (workloadSummary?.type_distribution) {
    checks.type_distribution_matches_workload_artifact =
      JSON.stringify(distribution) === JSON.stringify(workloadSummary.type_distribution);
  }

  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  const report = {
    checked_at: new Date().toISOString(),
    base_url: baseUrl,
    date_window: {
      from_date: start365Iso,
      to_date: todayIso,
    },
    selected_product_id: selectedProductId,
    db_snapshot: {
      generated_transaction_count: generatedTransactions.length,
      posted_transaction_count: postedTransactions.length,
      distinct_posted_dates: distinctPostedDates.size,
      type_distribution: distribution,
      generated_supplier_count: (supplierResult.data ?? []).length,
      generated_document_count: (documentResult.data ?? []).length,
      generated_payment_count: (paymentResult.data ?? []).length,
      supplier_summary: dbSupplierSummary,
    },
    api_snapshot: {
      dashboard_status: apiResults.dashboard.status,
      stock_summary_status: apiResults.stockSummary.status,
      supplier_status: apiResults.supplier.status,
      item_statement_status: apiResults.itemStatement.status,
      item_cost_evolution_status: apiResults.itemCostEvolution.status,
      export_transactions_status: apiResults.exportTransactions.status,
      export_supplier_status: apiResults.exportSupplier.status,
      supplier_summary: apiSupplierSummary,
    },
    checks,
    failed_checks: failedChecks,
    pass: failedChecks.length === 0,
  };

  const artifactPath = await writeArtifact("report-check.json", report);
  logInfo(`Wrote report artifact: ${artifactPath}`);

  if (failedChecks.length > 0) {
    throw new Error(`Validation failed: ${failedChecks.join(", ")}`);
  }

  logInfo("All report and DB cross-checks passed.");
}

main().catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
