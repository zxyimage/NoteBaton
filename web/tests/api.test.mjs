import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { EncryptedChannel, importPairKey, randomHex } from "./load-e2ee.mjs";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8788";
async function call(path, method = "GET", body, token, extra = {}) {
  const response = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json(),
  };
}
async function device() {
  const deviceId = randomUUID(),
    secret = randomBytes(32).toString("hex");
  assert.equal(
    (await call("/register", "POST", { deviceId, secret })).status,
    200,
  );
  return { deviceId, secret, token: `${deviceId}.owner.${secret}` };
}
async function pair(owner) {
  const p = (await call("/pair", "POST", { e2eeVersion: 1 })).data;
  assert.equal(
    (
      await call(
        "/pair/approve",
        "POST",
        { code: p.code, e2eeVersion: 1 },
        owner.token,
      )
    ).status,
    200,
  );
  const r = await call("/pair/status", "POST", p);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie"), /HttpOnly.*SameSite=Strict/);
  return { p, token: r.headers.get("set-cookie").split(";")[0].slice(14) };
}
function inbox(ws) {
  const queued = [],
    waiters = [];
  ws.on("message", (data) => {
    if (String(data) === "pong") return;
    const m = JSON.parse(data),
      i = waiters.findIndex((w) => w.filter(m));
    if (i >= 0) {
      const w = waiters.splice(i, 1)[0];
      clearTimeout(w.timer);
      w.resolve(m);
    } else queued.push(m);
  });
  return (filter = () => true, ms = 3000) =>
    new Promise((resolve, reject) => {
      const i = queued.findIndex(filter);
      if (i >= 0) {
        resolve(queued.splice(i, 1)[0]);
        return;
      }
      const w = {
        filter,
        resolve,
        timer: setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error("message timeout"));
        }, ms),
      };
      waiters.push(w);
    });
}
async function connect(token) {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/api/events?v=3", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const next = inbox(ws);
  const ready = await next((m) => m.type === "ready");
  return { ws, next, connectionId: ready.connectionId };
}
const send = (ws, data) => ws.send(JSON.stringify(data));
async function encryptedPair(phone, browser, owner, pairing) {
  const secret = randomHex(),
    key = await importPairKey(secret),
    clientNonce = randomHex();
  send(browser.ws, { type: "hello", v: 1, clientNonce });
  const hello = await phone.next(
    (m) => m.type === "hello" && m.clientNonce === clientNonce,
  );
  const context = {
    origin: new URL(base).origin,
    deviceId: owner.deviceId,
    peerId: pairing.token.split(".")[1],
    connectionId: hello.connectionId,
    clientNonce,
    phoneNonce: randomHex(),
  };
  assert.equal(hello.peerId, context.peerId);
  const p = await EncryptedChannel.create(key, context, "phone"),
    b = await EncryptedChannel.create(key, context, "browser");
  const phoneSend = async (value) =>
    send(phone.ws, {
      ...(await p.seal(value)),
      peerId: context.peerId,
      connectionId: context.connectionId,
    });
  send(phone.ws, {
    ...(await p.seal({ type: "secure-ready" }, "welcome")),
    peerId: context.peerId,
    connectionId: context.connectionId,
  });
  assert.equal(
    (await b.open(await browser.next((m) => m.type === "welcome"))).type,
    "secure-ready",
  );
  return { p, b, context, phoneSend };
}
test("encrypted relay: auth, isolation, opaque 100k messages, paging, offline, revocation, no plaintext fallback", async (t) => {
  assert.equal((await call("/session")).status, 401);
  assert.equal((await call("/pair", "POST", {})).status, 426);
  assert.equal(
    (
      await call("/pair", "POST", {}, undefined, {
        Origin: "https://untrusted.invalid",
      })
    ).status,
    403,
  );
  const owner = await device(),
    other = await device();
  assert.equal(
    (
      await call("/register", "POST", {
        deviceId: owner.deviceId,
        secret: other.secret,
      })
    ).status,
    409,
  );
  const pairing = await pair(owner),
    foreign = await pair(other);
  assert.equal(
    (await call("/pair/status", "POST", { ...pairing.p, secret: other.secret }))
      .status,
    410,
  );
  assert.equal(
    (
      await call(
        "/pair/approve",
        "POST",
        { code: pairing.p.code, e2eeVersion: 1 },
        other.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        "/pair/approve",
        "POST",
        { code: pairing.p.code, e2eeVersion: 1 },
        pairing.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("/peers", "GET", undefined, pairing.token)).status,
    403,
  );
  assert.equal(
    (await call("/clips", "POST", { text: "no persistence" }, owner.token))
      .status,
    404,
  );
  const session = (await call("/session", "GET", undefined, pairing.token))
    .data;
  assert.equal(session.deviceId, owner.deviceId);
  assert.equal(session.e2eeVersion, 1);
  assert.equal(
    (
      await call(
        "/session",
        "GET",
        undefined,
        `${other.deviceId}.${session.peerId}.${pairing.p.secret}`,
      )
    ).status,
    401,
  );
  const legacy = await fetch(base + "/api/events", {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(legacy.status, 426);
  const all = [];
  t.after(() => all.forEach((s) => s.ws.terminate()));
  const connectTracked = async (token) => {
    const s = await connect(token);
    all.push(s);
    return s;
  };
  const phone = await connectTracked(owner.token),
    browser = await connectTracked(pairing.token),
    secondTab = await connectTracked(pairing.token),
    foreignPhone = await connectTracked(other.token),
    foreignBrowser = await connectTracked(foreign.token);
  const secure = await encryptedPair(phone, browser, owner, pairing);
  let leaks = 0;
  for (const s of [secondTab, foreignPhone, foreignBrowser])
    s.ws.on("message", (raw) => {
      if (["sealed", "welcome", "hello"].includes(JSON.parse(raw).type))
        leaks++;
    });
  const latencies = [];
  for (const text of [
    "😀".repeat(100000),
    "\u0000".repeat(100000),
    "relay-e2ee-private-marker # 标题 **粗体**",
  ]) {
    const payload = {
      type: "request",
      requestId: randomUUID(),
      action: "save",
      id: randomUUID(),
      text,
      baseRevision: 0,
    };
    const start = performance.now();
    const encrypted = await secure.b.seal(payload);
    assert.ok(!JSON.stringify(encrypted).includes(payload.id));
    assert.ok(!JSON.stringify(encrypted).includes("relay-e2ee-private-marker"));
    // Unknown plaintext fields must never be forwarded by the relay.
    send(browser.ws, {
      ...encrypted,
      text: "must-be-stripped",
      action: "save",
      requestId: payload.requestId,
    });
    const routed = await phone.next((m) => m.type === "sealed");
    assert.equal(routed.text, undefined);
    assert.equal(routed.action, undefined);
    assert.equal(routed.requestId, undefined);
    assert.equal(routed.ciphertext, encrypted.ciphertext);
    assert.deepEqual(await secure.p.open(routed), payload);
    const note = {
      id: payload.id,
      text,
      revision: 1,
      createdAt: 1,
      updatedAt: 2,
    };
    await secure.phoneSend({
      type: "reply",
      requestId: payload.requestId,
      kind: "saved",
      note,
    });
    assert.deepEqual(
      (await secure.b.open(await browser.next((m) => m.type === "sealed")))
        .note,
      note,
    );
    latencies.push(performance.now() - start);
    assert.ok(latencies.at(-1) < 3000);
  }
  for (let i = 0; i < 10; i++) {
    await secure.phoneSend({
      type: "reply",
      kind: "item",
      note: { id: randomUUID(), text: "page " + i },
    });
    assert.equal(
      (await secure.b.open(await browser.next((m) => m.type === "sealed"))).note
        .text,
      "page " + i,
    );
  }
  await secure.phoneSend({
    type: "reply",
    kind: "page",
    hasMore: true,
    cursor: { id: randomUUID(), updatedAt: 1 },
  });
  assert.equal(
    (await secure.b.open(await browser.next((m) => m.type === "sealed")))
      .hasMore,
    true,
  );
  await secure.phoneSend({ type: "changed", id: randomUUID(), deleted: true });
  assert.equal(
    (await secure.b.open(await browser.next((m) => m.type === "sealed")))
      .deleted,
    true,
  );
  assert.equal(leaks, 0);
  const plaintext = await connectTracked(pairing.token);
  const rejected = new Promise((resolve) =>
    plaintext.ws.once("close", resolve),
  );
  send(plaintext.ws, { type: "request", action: "save", text: "old client" });
  assert.equal(await rejected, 1008);
  const closed = new Promise((resolve) => phone.ws.once("close", resolve));
  phone.ws.close();
  await closed;
  await browser.next((m) => m.type === "presence" && !m.phoneOnline);
  const reconnectedPhone = await connectTracked(owner.token);
  await browser.next((m) => m.type === "presence" && m.phoneOnline);
  const nextSecure = await encryptedPair(
    reconnectedPhone,
    browser,
    owner,
    pairing,
  );
  await assert.rejects(
    nextSecure.p.open(
      await secure.b.seal({ type: "request", action: "delete" }),
    ),
  );
  const revoked = new Promise((resolve) => browser.ws.once("close", resolve));
  assert.equal(
    (await call("/peers/" + session.peerId, "DELETE", undefined, owner.token))
      .status,
    200,
  );
  assert.equal(await revoked, 4001);
  assert.equal(
    (await call("/session", "GET", undefined, pairing.token)).status,
    401,
  );
  assert.equal(
    (await call("/session", "GET", undefined, foreign.token)).status,
    200,
  );
  console.log(
    "Encrypted local round-trip ms:",
    latencies.map((v) => Math.round(v)).join(", "),
  );
});


test("native pairing has isolated bearer credentials, one-year expiry and revocation", async () => {
  const owner = await device();
  const native = (await call("/pair", "POST", { e2eeVersion: 1, clientType: "native" })).data;
  assert.equal((await call("/pair/status", "POST", native)).data.approved, false);
  const approval = await call("/pair/approve", "POST", { code: native.code, e2eeVersion: 1 }, owner.token);
  assert.equal(approval.status, 200);
  assert.equal(approval.data.kind, "native");
  assert.ok(approval.data.expiresAt > Date.now() + 364 * 86400000);
  const claimed = await call("/pair/status", "POST", native);
  assert.equal(claimed.headers.get("set-cookie"), null);
  assert.equal(claimed.data.token, `${owner.deviceId}.${approval.data.peerId}.${native.secret}`);
  assert.equal((await call("/session", "GET", undefined, claimed.data.token)).status, 200);
  const peers = (await call("/peers", "GET", undefined, owner.token)).data.peers;
  assert.equal(peers.find(p => p.id === approval.data.peerId).kind, "native");
  const wrong = await call("/pair/status", "POST", { ...native, secret: randomHex() });
  assert.equal(wrong.status, 410);
  const browser = await pair(owner);
  const webClaim = await call("/pair/status", "POST", { ...browser.p, clientType: "native" });
  assert.equal(webClaim.data.token, undefined);
  assert.ok(webClaim.headers.get("set-cookie"));
  const webSession = (await call("/session", "GET", undefined, browser.token)).data;
  assert.ok(webSession.expiresAt < Date.now() + 8 * 86400000);
  assert.equal((await call(`/peers/${approval.data.peerId}`, "DELETE", undefined, browser.token)).status, 403);
  assert.equal((await call("/logout", "POST", undefined, claimed.data.token)).status, 200);
  assert.equal((await call("/session", "GET", undefined, claimed.data.token)).status, 401);
  assert.equal((await call("/pair/status", "POST", native)).status, 410);
  assert.equal((await call("/session", "GET", undefined, browser.token)).status, 200);
});
