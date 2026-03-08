"use client";

export type BarcodePrintFormat = "a4" | "thermal";

export type BarcodeLabel = {
  productName: string;
  sku: string | null;
  barcode: string;
};

type PrintOptions = {
  format: BarcodePrintFormat;
  quantity: number;
  title?: string;
};

type LineInput = {
  productId: string;
  productName?: string | null;
  productSku?: string | null;
  productBarcode?: string | null;
  useSnapshot?: boolean;
};

type ProductLookup = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
};

type BuildBarcodeLabelsResult = { labels: BarcodeLabel[] } | { error: string };
type PrintBarcodeLabelsResult = { ok: true } | { error: string };

type JsBarcodeOptions = {
  format: string;
  displayValue: boolean;
  margin: number;
  width: number;
  height: number;
  fontSize: number;
  textMargin: number;
  background: string;
  lineColor: string;
};

type JsBarcodeFunction = (target: SVGElement, text: string, options: JsBarcodeOptions) => void;

let jsBarcodeModulePromise: Promise<unknown> | null = null;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function renderBarcodeSvg(barcodeValue: string) {
  if (!jsBarcodeModulePromise) {
    jsBarcodeModulePromise = import("jsbarcode");
  }
  const jsBarcodeModule = await jsBarcodeModulePromise;
  const jsBarcodeCandidate =
    typeof jsBarcodeModule === "function"
      ? jsBarcodeModule
      : (jsBarcodeModule as { default?: unknown }).default;
  if (typeof jsBarcodeCandidate !== "function") {
    throw new Error("Failed to load barcode generator.");
  }
  const jsBarcode = jsBarcodeCandidate as JsBarcodeFunction;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  jsBarcode(svg, barcodeValue, {
    format: "CODE128",
    displayValue: true,
    margin: 0,
    width: 1.6,
    height: 54,
    fontSize: 13,
    textMargin: 4,
    background: "#ffffff",
    lineColor: "#101010",
  });
  return svg.outerHTML;
}

function getLayoutCss(format: BarcodePrintFormat) {
  if (format === "thermal") {
    return `
      .labels {
        display: flex;
        flex-direction: column;
        gap: 6mm;
      }
      .label {
        width: 58mm;
        min-height: 32mm;
        border: 0.2mm solid #000;
        border-radius: 1.2mm;
        padding: 2.2mm;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      @media print {
        @page { size: 62mm auto; margin: 2mm; }
        body { margin: 0; padding: 0; }
      }
    `;
  }

  return `
    .labels {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8mm;
    }
    .label {
      min-height: 36mm;
      border: 0.2mm solid #000;
      border-radius: 1.6mm;
      padding: 2.6mm;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    @media print {
      @page { size: A4; margin: 8mm; }
    }
  `;
}

async function renderLabelBlock(label: BarcodeLabel) {
  const product = escapeHtml(label.productName);
  const sku = escapeHtml(label.sku ?? "-");
  const barcode = label.barcode.trim();
  const svgMarkup = await renderBarcodeSvg(barcode);

  return `
    <article class="label">
      <p class="name">${product}</p>
      <p class="sku">SKU: ${sku}</p>
      <div class="barcode">${svgMarkup}</div>
    </article>
  `;
}

export function buildBarcodeLabelsFromLines(
  lines: LineInput[],
  productById: Map<string, ProductLookup>,
): BuildBarcodeLabelsResult {
  if (lines.length === 0) {
    return { error: "Selected row has no lines to print." } as const;
  }

  const missing: string[] = [];
  const labels: BarcodeLabel[] = [];

  for (const line of lines) {
    const product = productById.get(line.productId);
    const useSnapshot = line.useSnapshot === true;

    if (!useSnapshot && !product) {
      missing.push(line.productId);
      continue;
    }

    const productName = useSnapshot
      ? line.productName?.trim() || line.productId
      : product?.name ?? line.productId;
    const sku = useSnapshot
      ? line.productSku?.trim() || null
      : product?.sku?.trim() || null;
    const barcode = useSnapshot
      ? line.productBarcode?.trim() ?? ""
      : product?.barcode?.trim() ?? "";

    if (barcode.length === 0) {
      const identifier = sku ? `${sku} (${productName})` : productName;
      missing.push(identifier);
      continue;
    }

    labels.push({
      productName,
      sku,
      barcode,
    });
  }

  if (missing.length > 0) {
    return {
      error: `Cannot print labels. Missing barcode for: ${missing.join(", ")}`,
    } as const;
  }

  if (labels.length === 0) {
    return { error: "No printable barcode labels for this row." } as const;
  }

  return { labels } as const;
}

export async function printBarcodeLabels(
  labels: BarcodeLabel[],
  options: PrintOptions,
): Promise<PrintBarcodeLabelsResult> {
  if (!Number.isInteger(options.quantity) || options.quantity < 1) {
    return { error: "Label quantity must be an integer greater than or equal to 1." };
  }

  if (labels.length === 0) {
    return { error: "No labels to print." };
  }

  const expandedLabels: BarcodeLabel[] = [];
  for (const label of labels) {
    for (let count = 0; count < options.quantity; count += 1) {
      expandedLabels.push(label);
    }
  }

  const popup = window.open("", "_blank", "noopener,noreferrer,width=980,height=760");
  if (!popup) {
    return { error: "Pop-up blocked. Please allow pop-ups and try again." };
  }

  const title = escapeHtml(options.title ?? "Barcode Labels");
  let labelsMarkup: string;
  try {
    labelsMarkup = (await Promise.all(expandedLabels.map((label) => renderLabelBlock(label)))).join(
      "",
    );
  } catch {
    return { error: "Failed to render barcode labels." };
  }
  const layoutCss = getLayoutCss(options.format);

  popup.document.open();
  popup.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: Arial, sans-serif;
        color: #101010;
        padding: 8mm;
        background: #fff;
      }
      h1 {
        margin: 0 0 6mm 0;
        font-size: 4.4mm;
        font-weight: 700;
      }
      .name {
        margin: 0 0 1.5mm 0;
        font-size: 3.5mm;
        font-weight: 700;
        line-height: 1.2;
      }
      .sku {
        margin: 0 0 1.7mm 0;
        font-size: 3mm;
      }
      .barcode svg {
        width: 100%;
        height: auto;
        display: block;
      }
      ${layoutCss}
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <section class="labels">${labelsMarkup}</section>
    <script>
      window.addEventListener("load", () => {
        setTimeout(() => {
          window.print();
        }, 80);
      });
    </script>
  </body>
</html>`);
  popup.document.close();

  return { ok: true };
}
