export function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];

  for (const row of rows) {
    const values = headers.map((header) => escapeCsvValue(row[header]));
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue =
    typeof value === "string" ? value : JSON.stringify(value).replace(/^"|"$/g, "");

  const escaped = stringValue.replace(/"/g, '""');

  if (/[",\n]/.test(escaped)) {
    return `"${escaped}"`;
  }

  return escaped;
}
