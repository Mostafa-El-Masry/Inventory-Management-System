import { toCsv } from "@/lib/utils/csv";

import type { ExportDataset, ExportRow } from "@/lib/export/contracts";

function buildFilename(filenameBase: string, extension: string) {
  return `${filenameBase}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

function normalizeRawValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return JSON.stringify(value);
}

function normalizeDisplayValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(value);
}

function orderedRawRows(dataset: ExportDataset) {
  return dataset.rows.map((row) => {
    const ordered: ExportRow = {};
    for (const column of dataset.columns) {
      ordered[column.key] = normalizeRawValue(row[column.key]);
    }
    return ordered;
  });
}

function orderedDisplayRows(dataset: ExportDataset) {
  return dataset.rows.map((row) =>
    dataset.columns.map((column) => normalizeDisplayValue(row[column.key])),
  );
}

function downloadBlob(filename: string, type: string, contents: BlobPart[]) {
  const blob = new Blob(contents, { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function buildCsvText(dataset: ExportDataset) {
  const rows = orderedRawRows(dataset);
  if (rows.length > 0) {
    return toCsv(rows);
  }

  return `${dataset.columns.map((column) => column.key).join(",")}\n`;
}

async function exportCsv(dataset: ExportDataset) {
  downloadBlob(
    buildFilename(dataset.filenameBase, "csv"),
    "text/csv;charset=utf-8",
    ["\uFEFF", buildCsvText(dataset)],
  );
}

function sanitizeSheetName(title: string) {
  const sanitized = title.replace(/[\\/*?:[\]]/g, " ").trim();
  return sanitized.slice(0, 31) || "Export";
}

async function exportExcel(dataset: ExportDataset) {
  const XLSX = await import("xlsx");
  const body = dataset.rows.length
    ? dataset.rows.map((row) =>
        dataset.columns.map((column) => normalizeRawValue(row[column.key])),
      )
    : [];

  const worksheet = XLSX.utils.aoa_to_sheet([
    dataset.columns.map((column) => column.label),
    ...body,
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(dataset.title));
  XLSX.writeFile(workbook, buildFilename(dataset.filenameBase, "xlsx"));
}

function resolveOrientation(dataset: ExportDataset) {
  if (dataset.printOrientation) {
    return dataset.printOrientation;
  }

  return dataset.columns.length > 6 ? "landscape" : "portrait";
}

async function exportPdf(dataset: ExportDataset) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const orientation = resolveOrientation(dataset);
  const doc = new jsPDF({
    orientation,
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const summaryText = (dataset.filterSummary ?? []).filter(Boolean).join(" | ");
  const timestamp = `Generated ${new Date().toLocaleString()}`;

  doc.setFontSize(16);
  doc.text(dataset.title, 40, 40);

  let cursorY = 60;
  if (summaryText) {
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(summaryText, pageWidth - 80);
    doc.text(lines, 40, cursorY);
    cursorY += lines.length * 12 + 8;
  }

  doc.setFontSize(9);
  doc.text(timestamp, 40, cursorY);
  cursorY += 14;

  const body =
    dataset.rows.length > 0
      ? orderedDisplayRows(dataset)
      : [[dataset.emptyMessage ?? "No data available.", ...Array(dataset.columns.length - 1).fill("")]];

  autoTable(doc, {
    head: [dataset.columns.map((column) => column.label)],
    body,
    startY: cursorY,
    styles: {
      fontSize: 8,
      cellPadding: 5,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [83, 124, 210],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    bodyStyles: {
      textColor: [22, 26, 32],
    },
    alternateRowStyles: {
      fillColor: [246, 248, 252],
    },
    margin: {
      left: 40,
      right: 40,
    },
  });

  doc.save(buildFilename(dataset.filenameBase, "pdf"));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function printDataset(dataset: ExportDataset) {
  const orientation = resolveOrientation(dataset);
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1280,height=960");

  if (!printWindow) {
    throw new Error("Print window was blocked by the browser.");
  }

  const summary = (dataset.filterSummary ?? [])
    .filter(Boolean)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const rows =
    dataset.rows.length > 0
      ? dataset.rows
          .map(
            (row) =>
              `<tr>${dataset.columns
                .map(
                  (column) =>
                    `<td>${escapeHtml(normalizeDisplayValue(row[column.key]))}</td>`,
                )
                .join("")}</tr>`,
          )
          .join("")
      : `<tr><td colspan="${dataset.columns.length}">${escapeHtml(
          dataset.emptyMessage ?? "No data available.",
        )}</td></tr>`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(dataset.title)}</title>
    <style>
      @page {
        size: ${orientation};
        margin: 12mm;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: #161a20;
        font-family: Arial, sans-serif;
        font-size: 12px;
      }

      h1 {
        margin: 0 0 8px;
        font-size: 22px;
      }

      .meta {
        margin-bottom: 16px;
        color: #64748b;
        font-size: 11px;
      }

      .summary {
        margin: 0 0 16px;
        padding-left: 18px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        border: 1px solid #d7deea;
        padding: 8px;
        text-align: left;
        vertical-align: top;
      }

      th {
        background: #eff4fb;
        font-weight: 700;
      }

      tbody tr:nth-child(even) {
        background: #f8fafc;
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(dataset.title)}</h1>
    <div class="meta">Generated ${escapeHtml(new Date().toLocaleString())}</div>
    ${summary ? `<ul class="summary">${summary}</ul>` : ""}
    <table>
      <thead>
        <tr>${dataset.columns
          .map((column) => `<th>${escapeHtml(column.label)}</th>`)
          .join("")}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  await new Promise<void>((resolve) => {
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      resolve();
    }, 250);
  });
}

export async function runExport(dataset: ExportDataset, format: "csv" | "xlsx" | "pdf") {
  if (format === "csv") {
    await exportCsv(dataset);
    return;
  }

  if (format === "xlsx") {
    await exportExcel(dataset);
    return;
  }

  await exportPdf(dataset);
}

export async function runPrint(dataset: ExportDataset) {
  await printDataset(dataset);
}
