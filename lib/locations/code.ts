function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFallbackPrefix(fallbackPrefix: string) {
  const cleaned = fallbackPrefix.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const effective = cleaned.length > 0 ? cleaned : "LOC";
  if (effective.length >= 3) {
    return effective.slice(0, 3);
  }

  return effective.padEnd(3, "X");
}

export function deriveNamePrefix(name: string, fallbackPrefix: string) {
  const upper = name.toUpperCase();
  const lettersOnly = upper.replace(/[^A-Z]/g, "");

  if (lettersOnly.length >= 3) {
    return lettersOnly.slice(0, 3);
  }

  if (lettersOnly.length > 0) {
    return lettersOnly.padEnd(3, "X");
  }

  return normalizeFallbackPrefix(fallbackPrefix);
}

export function nextPrefixedCode(prefix: string, existingCodes: string[]) {
  const normalizedPrefix = prefix.toUpperCase();
  const pattern = new RegExp(`^${escapeRegExp(normalizedPrefix)}-(\\d+)$`);
  let maxSuffix = 0;

  for (const code of existingCodes) {
    const match = code.trim().toUpperCase().match(pattern);
    if (!match) {
      continue;
    }

    const suffix = Number.parseInt(match[1], 10);
    if (Number.isNaN(suffix)) {
      continue;
    }

    maxSuffix = Math.max(maxSuffix, suffix);
  }

  const nextSuffix = maxSuffix + 1;
  return `${normalizedPrefix}-${String(nextSuffix).padStart(2, "0")}`;
}
