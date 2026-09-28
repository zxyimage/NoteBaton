import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
const bundle = await build({
  entryPoints: ["src/localization.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { detectLanguage, translate } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

test("language preference overrides the browser and unsupported preferences fall back safely", () => {
  assert.equal(detectLanguage("en", ["zh-CN"]), "en");
  assert.equal(detectLanguage("zh-CN", ["en-US"]), "zh-CN");
  assert.equal(detectLanguage(null, ["zh-Hans-CN"]), "zh-CN");
  assert.equal(detectLanguage("invalid", ["de-DE"]), "en");
  assert.equal(detectLanguage(null, []), "en");
});

test("existing statuses and protocol errors can change language without changing state", () => {
  assert.equal(translate("接到这里。", "en"), "Right here.");
  assert.equal(translate("已保存到手机", "en"), "Saved to phone");
  assert.equal(translate("constructor", "en"), "constructor");
  assert.equal(translate("__proto__", "zh-CN"), "__proto__");
  assert.equal(translate("Saved to phone", "zh-CN"), "已保存到手机");
  assert.equal(
    translate("配对已失效，请重新配对", "en"),
    "Pairing expired. Please pair again.",
  );
  assert.equal(
    translate("Unknown server error: 503", "en"),
    "Unknown server error: 503",
  );
});

test("both bundled App locales contain the shared strings and interpolation placeholders", async () => {
  const messages = JSON.parse(
    await readFile("../shared/messages.json", "utf8"),
  );
  for (const [locale, folder] of [
    ["en", "en"],
    ["zh-CN", "zh-Hans"],
  ]) {
    const resource = await readFile(
      `../ios/Clipboard/${folder}.lproj/Localizable.strings`,
      "utf8",
    );
    for (const [key, value] of Object.entries(messages)) {
      assert.ok(value[locale], `${locale}: ${key}`);
      assert.equal(
        (key.match(/%@/g) ?? []).length,
        (value[locale].match(/%@/g) ?? []).length,
        `Placeholder mismatch: ${key}`,
      );
      assert.ok(
        resource.includes(
          `${JSON.stringify(key)} = ${JSON.stringify(value[locale])};`,
        ),
        `Missing App string: ${key}`,
      );
    }
  }
});
