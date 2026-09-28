import { readFile, writeFile } from "node:fs/promises";
// Wrangler's runtime declarations include trailing spaces in a few union types.
const file = "worker-configuration.d.ts";
const content = await readFile(file, "utf8");
await writeFile(file, content.replace(/[\t ]+$/gm, ""));
