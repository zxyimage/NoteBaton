import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["shared/e2ee.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
export const { EncryptedChannel, importPairKey, randomHex } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
