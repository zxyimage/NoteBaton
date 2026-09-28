import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["shared/pairing.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { pairingLink } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const fixtures = JSON.parse(
  await readFile("../tests/pairing-fixtures.json", "utf8"),
);
test("QR link uses the deployment origin and never includes browser claim credentials", () => {
  for (const item of fixtures.valid.filter((item) => item.code)) {
    const link = new URL(pairingLink(item.server, item.code, item.key));
    assert.equal(link.origin, item.server);
    assert.equal(link.pathname, "/pair");
    assert.equal(link.search, "");
    assert.equal(link.hash, `#v=2&code=${item.code}&key=${item.key}`);
  }
  assert.throws(() =>
    pairingLink(
      "http://untrusted.example",
      fixtures.valid[0].code,
      fixtures.valid[0].key,
    ),
  );
  assert.throws(() =>
    pairingLink(
      "https://user:password@host.example",
      fixtures.valid[0].code,
      fixtures.valid[0].key,
    ),
  );
  assert.throws(() =>
    pairingLink(
      "https://host.example/api",
      fixtures.valid[0].code,
      fixtures.valid[0].key,
    ),
  );
});
test("fresh deployment identifies its public protocol without credentials", async () => {
  const response = await fetch(
    (process.env.TEST_BASE_URL ?? "http://127.0.0.1:8788") + "/api/info",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    product: "relay-clipboard",
    protocolVersion: 3,
    pairingLinkVersion: 2,
    e2eeVersion: 1,
    storage: "device",
    replicaVersion: 1,
    maxNoteCharacters: 100000,
    pageSize: 10,
  });
});
