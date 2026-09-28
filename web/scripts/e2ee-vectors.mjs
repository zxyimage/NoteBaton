import { writeFile } from "node:fs/promises";
import { EncryptedChannel, importPairKey } from "../tests/load-e2ee.mjs";
const secret = "0123456789abcdef".repeat(4);
const context = {
  origin: "https://relay.example",
  deviceId: "11111111-1111-4111-8111-111111111111",
  peerId: "22222222-2222-4222-8222-222222222222",
  connectionId: "33333333-3333-4333-8333-333333333333",
  clientNonce: "ab".repeat(32),
  phoneNonce: "cd".repeat(32),
};
const key = await importPairKey(secret);
const browser = await EncryptedChannel.create(key, context, "browser"),
  phone = await EncryptedChannel.create(key, context, "phone");
const vectors = [];
for (const text of [
  "Markdown 中文 😀\u0000",
  "😀".repeat(100000),
  "\u0000".repeat(100000),
]) {
  const plaintext = JSON.stringify({ type: "note", text });
  vectors.push({
    plaintext,
    browserFrame: await browser.seal(JSON.parse(plaintext)),
    phoneFrame: await phone.seal(JSON.parse(plaintext)),
  });
}
await writeFile(process.argv[2], JSON.stringify({ secret, context, vectors }));
console.log("Generated Web Crypto interoperability vectors (synthetic data).");
