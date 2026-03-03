export function normalizeTaxonomyName(name: string) {
  return name.trim().toLowerCase();
}

function nextNumericCode(
  existingCodes: string[],
  width: number,
  min: number,
  max: number,
) {
  let maxCode = min - 1;
  for (const code of existingCodes) {
    const numeric = Number.parseInt(code.trim(), 10);
    if (Number.isNaN(numeric)) {
      continue;
    }
    maxCode = Math.max(maxCode, numeric);
  }

  const next = maxCode + 1;
  if (next > max) {
    return null;
  }

  return String(next).padStart(width, "0");
}

export function nextCategoryCode(existingCodes: string[]) {
  return nextNumericCode(existingCodes, 2, 1, 99);
}

export function nextSubcategoryCode(existingCodes: string[]) {
  return nextNumericCode(existingCodes, 3, 1, 999);
}
