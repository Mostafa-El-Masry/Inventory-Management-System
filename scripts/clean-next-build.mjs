import { rm } from "node:fs/promises";
import { join } from "node:path";

const target = join(process.cwd(), ".next");

await rm(target, {
  recursive: true,
  force: true,
});
