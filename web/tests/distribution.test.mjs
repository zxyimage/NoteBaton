import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8788";
const siteBase = process.env.TEST_SITE_BASE_URL;
const navigation = { headers: { "Sec-Fetch-Mode": "navigate", Accept: "text/html" } };

test("self-hosted output contains only workspace assets and has no product-site dependencies", async () => {
  assert.deepEqual((await readdir("dist/relay")).sort(), ["assets", "favicon.svg", "index.html", "third-party-notices.txt"]);
  const bundle = await build({
    entryPoints: ["src/main.tsx"], bundle: true, write: false,
    metafile: true, loader: { ".css": "empty" }, format: "esm",
  });
  const inputs = Object.keys(bundle.metafile.inputs);
  for (const excluded of ["site.config.json", "src/Home.tsx", "src/DownloadPage.tsx", "src/SiteLinks.tsx", "src/site.messages.json"])
    assert.ok(!inputs.includes(excluded), `${excluded} leaked into the notes service`);
});

test("notes entry points work while product, policy, and download routes are absent", async () => {
  const root = await fetch(base + "/", navigation);
  assert.equal(root.status, 200);
  const html = await root.text();
  assert.match(html, /Note · NoteBaton/);
  for (const path of ["/note", "/note/", "/pair", "/pair/"]) {
    const response = await fetch(base + path, navigation);
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), html, path);
  }
  for (const path of ["/download", "/downloads/NoteBaton-macOS-1.0.0.dmg", "/privacy", "/privacy/", "/privacy/zh-CN/", "/terms/", "/app-privacy/", "/support/", "/legal.css", "/missing", "/assets/missing.js"]) {
    const response = await fetch(base + path, navigation);
    assert.equal(response.status, 404, path);
  }
  for (const path of ["/favicon.svg", "/third-party-notices.txt"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
  }
});

test("site source retains its pages and links to externally published installers", { skip: !siteBase }, async () => {
  assert.ok(!(await readdir("dist/site")).includes("downloads"));
  assert.match(await readFile("src/downloads.ts", "utf8"), /https:\/\/notebaton\.org\/downloads\//);
  for (const path of ["/", "/note", "/download", "/privacy/", "/privacy/zh-CN/", "/terms/", "/app-privacy/", "/support/"]) {
    const response = await fetch(siteBase + path, navigation);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /text\/html/, path);
  }
  const relayConfig = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  const siteConfig = JSON.parse(await readFile("wrangler.site.jsonc", "utf8"));
  assert.deepEqual(siteConfig.migrations, relayConfig.migrations);
  assert.deepEqual(siteConfig.durable_objects, relayConfig.durable_objects);
});
