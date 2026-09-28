import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const blocks = [
  "Relay Clipboard — Third-party notices",
  "Generated from package-lock.json and installed license files. Do not edit by hand.",
  "This lists the production dependency tree, including optional CLI dependencies, and the license for generated Worker runtime types. Third-party components retain their own licenses.",
];
const packages = Object.entries(lock.packages)
  .filter(([name, info]) => name && !info.dev)
  .sort(([a], [b]) => a.localeCompare(b, "en"));
for (const [directory, info] of packages) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, "package.json"), "utf8"),
  );
  const files = (await readdir(directory))
    .filter((name) => /^(licen[cs]e|copying|notice)([.-]|$)/i.test(name))
    .sort();
  if (!files.length)
    throw new Error(`Missing third-party license: ${manifest.name}`);
  blocks.push(
    `${"=".repeat(72)}\n${manifest.name} ${info.version} (${info.license ?? manifest.license})`,
  );
  for (const file of files)
    blocks.push(
      `${file}\n${(await readFile(path.join(directory, file), "utf8")).trim()}`,
    );
}
// worker-configuration.d.ts retains Cloudflare and Microsoft's Apache-2.0 notice.
blocks.push(
  `${"=".repeat(72)}\nGenerated Worker runtime type definitions\nCopyright (c) Cloudflare. All rights reserved.\nCopyright (c) Microsoft Corporation. All rights reserved.`,
);
blocks.push((await readFile("node_modules/typescript/LICENSE", "utf8")).trim());
blocks.push(
  (await readFile("node_modules/typescript/NOTICE.txt", "utf8")).trim(),
);
const content = (blocks.join("\n\n") + "\n").replace(/\r\n?/g, "\n").replace(/[\t ]+$/gm, "");
const outputs = [
  "../THIRD_PARTY_NOTICES.txt",
  "public/third-party-notices.txt",
  "../ios/Clipboard/Markdown/third-party-notices.txt",
];
for (const output of outputs) {
  if (process.argv.includes("--check")) {
    if ((await readFile(output, "utf8")) !== content)
      throw new Error(
        `Notices are stale: ${output}. Run npm run build:notices.`,
      );
  } else {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, content);
  }
}
console.log(
  `Third-party notices ${process.argv.includes("--check") ? "verified" : "generated"} for ${packages.length} dependencies and Worker types.`,
);
