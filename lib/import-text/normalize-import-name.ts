export function normalizeImportName(value: string) {
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (!collapsed) {
    return "";
  }

  return collapsed
    .toLowerCase()
    .replace(/(^|[\s'/-])([a-z])/g, (match, prefix: string, character: string) => {
      return `${prefix}${character.toUpperCase()}`;
    });
}
