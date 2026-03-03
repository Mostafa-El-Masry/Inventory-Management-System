import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const TARGETS = [
  { base: "app", extensions: new Set([".tsx", ".css"]) },
  { base: "components", extensions: new Set([".tsx"]) },
];

const PX_LITERAL_REGEX = /(?<![A-Za-z0-9_.-])(?:\d+|\d*\.\d+)px\b/g;

async function walk(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath)));
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

function getLineAndColumn(content, index) {
  const prefix = content.slice(0, index);
  const lines = prefix.split(/\r?\n/u);
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

async function collectTargetFiles() {
  const files = [];

  for (const target of TARGETS) {
    const basePath = path.join(ROOT, target.base);
    const walked = await walk(basePath);
    for (const filePath of walked) {
      if (target.extensions.has(path.extname(filePath))) {
        files.push(filePath);
      }
    }
  }

  return files;
}

async function main() {
  const files = await collectTargetFiles();
  const violations = [];

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    let match;

    while ((match = PX_LITERAL_REGEX.exec(content)) !== null) {
      const { line, column } = getLineAndColumn(content, match.index);
      violations.push({
        filePath: path.relative(ROOT, filePath),
        line,
        column,
        value: match[0],
      });
    }
  }

  if (violations.length === 0) {
    console.log("No numeric `px` literals found in app/components UI sources.");
    return;
  }

  console.error("Numeric `px` literals are not allowed. Use responsive units instead:");
  for (const violation of violations) {
    console.error(
      `- ${violation.filePath}:${violation.line}:${violation.column} -> ${violation.value}`,
    );
  }
  process.exit(1);
}

main().catch((error) => {
  console.error("Failed to run px-literal check:", error);
  process.exit(1);
});
