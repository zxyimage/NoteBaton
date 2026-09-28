import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, hkdfSync } from "node:crypto";
import { EncryptedChannel, importPairKey, randomHex } from "./load-e2ee.mjs";

export const secret = "0123456789abcdef".repeat(4);
export const context = {
  origin: "https://relay.example",
  deviceId: "11111111-1111-4111-8111-111111111111",
  peerId: "22222222-2222-4222-8222-222222222222",
  connectionId: "33333333-3333-4333-8333-333333333333",
  clientNonce: "ab".repeat(32),
  phoneNonce: "cd".repeat(32),
};
test("Web Crypto matches independent AES-GCM/HKDF, rejects tampering, replay, reflection and wrong context", async () => {
  const key = await importPairKey(secret);
  assert.equal(key.extractable, false);
  const create = (role, changes = {}, k = key) =>
    EncryptedChannel.create(k, { ...context, ...changes }, role);
  const browser = await create("browser"),
    phone = await create("phone");
  const payload = {
    type: "request",
    action: "save",
    text: "Private marker 中文 😀\u0000",
  };
  const frame = await browser.seal(payload);
  const label = ["relay-e2ee-v1", ...Object.values(context)].join("\n");
  const direction = "browser-to-phone";
  const derived = hkdfSync(
    "sha256",
    Buffer.from(secret, "hex"),
    Buffer.from(context.clientNonce + context.phoneNonce, "hex"),
    `${label}\n${direction}`,
    32,
  );
  const iv = Buffer.alloc(12);
  iv.writeUInt32BE(1, 8);
  const cipher = createCipheriv("aes-256-gcm", derived, iv);
  cipher.setAAD(Buffer.from(`${label}\n${direction}\n1`));
  const expected = Buffer.concat([
    cipher.update(JSON.stringify(payload)),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
  assert.equal(frame.ciphertext, expected);
  assert.ok(!JSON.stringify(frame).includes("Private marker"));
  assert.deepEqual(await phone.open(frame), payload);
  await assert.rejects(phone.open(frame));
  const damaged = {
    ...frame,
    ciphertext:
      (frame.ciphertext[0] === "A" ? "B" : "A") + frame.ciphertext.slice(1),
  };
  await assert.rejects((await create("phone")).open(damaged));
  await assert.rejects(
    (await create("phone", {}, await importPairKey(randomHex()))).open(frame),
  );
  await assert.rejects((await create("browser")).open(frame));
  for (const field of [
    "origin",
    "peerId",
    "deviceId",
    "connectionId",
    "clientNonce",
    "phoneNonce",
  ]) {
    const replacement =
      field === "origin"
        ? "https://other.example"
        : field.endsWith("Nonce")
          ? randomHex()
          : "44444444-4444-4444-8444-444444444444";
    await assert.rejects(
      (await create("phone", { [field]: replacement })).open(frame),
    );
  }
  await assert.rejects((await create("phone")).open({ ...frame, seq: 2 }));
  await assert.rejects((await create("phone")).open({ ...frame, v: 0 }));
  for (const text of ["😀".repeat(100000), "\u0000".repeat(100000)]) {
    const f = await browser.seal({ text });
    assert.deepEqual(await phone.open(f), { text });
    assert.deepEqual(await browser.open(await phone.seal({ text })), { text });
  }
});
