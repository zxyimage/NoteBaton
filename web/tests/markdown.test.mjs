import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["shared/markdown.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { renderMarkdown } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
test("shared Markdown escapes HTML, rejects executable URLs and remote image requests", () => {
  const html = renderMarkdown(
    "# 标题\n\n**粗体**\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n![image](https://evil.invalid/tracker.png)",
  );
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /<strong>粗体<\/strong>/);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes("<img"));
  const table = renderMarkdown("| A | B |\n|---|---|\n| 1 | 2 |");
  assert.match(table, /<table>/);
  const long = renderMarkdown("😀".repeat(100000));
  assert.equal(Array.from(long.replace(/<[^>]*>/g, "").trim()).length, 100000);
});
