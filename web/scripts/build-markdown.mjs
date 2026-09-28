import { build } from "esbuild";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
const output = "../ios/Clipboard/Markdown";
await mkdir(output, { recursive: true });
await build({
  entryPoints: ["shared/native-markdown.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: `${output}/renderer.js`,
  target: "safari17",
});
await copyFile("shared/markdown.css", `${output}/markdown.css`);
await writeFile(
  `${output}/index.html`,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'none'; base-uri 'none'"><link rel="stylesheet" href="markdown.css"><style>html,body{margin:0;background:transparent}body{padding:16px;box-sizing:border-box}</style></head><body class="native-markdown"><article id="content" class="markdown-body"></article><script src="renderer.js"></script></body></html>`,
);
