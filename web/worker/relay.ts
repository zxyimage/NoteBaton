import { DurableObject } from "cloudflare:workers";
import { digest, hex, tokenFrom } from "./security";
import { MAX_FRAME, hex32, uuid } from "../shared/e2ee";

export type Credential = { deviceId: string; peerId: string; hash: string };
type Peer = {
  id: string;
  hash: string;
  name: string;
  expiresAt: number;
  createdAt: number;
  kind: string;
};
type Attachment = {
  peerId: string;
  expiresAt: number;
  connectionId: string;
  protocol: number;
  kind?: string;
  count?: number;
  window?: number;
};
export const uuidPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const secretPattern = /^[a-f0-9]{64}$/;
export { MAX_FRAME };
export const randomSecret = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export function equalHash(a: string, b: string): boolean {
  return (
    a.length === 64 &&
    b.length === 64 &&
    crypto.subtle.timingSafeEqual(
      new TextEncoder().encode(a),
      new TextEncoder().encode(b),
    )
  );
}
export async function credential(request: Request): Promise<Credential | null> {
  const [deviceId, peerId, secret, extra] = tokenFrom(request).split(".");
  if (
    extra ||
    !uuidPattern.test(deviceId ?? "") ||
    !(peerId === "owner" || uuidPattern.test(peerId ?? "")) ||
    !secretPattern.test(secret ?? "")
  )
    return null;
  return { deviceId, peerId, hash: await digest(secret) };
}

// Only identity, pairing and connection metadata is durable. Note frames never
// enter SQLite, KV, alarms, logs, or WebSocket attachments.
export class RelayRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS identity (id INTEGER PRIMARY KEY CHECK(id=1), hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS peers (id TEXT PRIMARY KEY, hash TEXT NOT NULL, name TEXT NOT NULL, expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL);",
    );
    if (
      !ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(peers)")
        .toArray()
        .some((c) => c.name === "e2ee")
    ) {
      ctx.storage.sql.exec(
        "ALTER TABLE peers ADD COLUMN e2ee INTEGER NOT NULL DEFAULT 0",
      );
    }
    if (!ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(peers)").toArray().some(c => c.name === "kind")) {
      ctx.storage.sql.exec("ALTER TABLE peers ADD COLUMN kind TEXT NOT NULL DEFAULT 'web'");
    }
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }
  register(hash: string): boolean {
    const existing = this.ctx.storage.sql
      .exec<{ hash: string }>("SELECT hash FROM identity WHERE id=1")
      .toArray()[0];
    if (existing) return equalHash(existing.hash, hash);
    this.ctx.storage.sql.exec("INSERT INTO identity VALUES (1,?)", hash);
    return true;
  }
  authorize(c: Credential): boolean {
    if (c.peerId === "owner") {
      const row = this.ctx.storage.sql
        .exec<{ hash: string }>("SELECT hash FROM identity WHERE id=1")
        .toArray()[0];
      return !!row && equalHash(row.hash, c.hash);
    }
    const row = this.ctx.storage.sql
      .exec<Peer>("SELECT * FROM peers WHERE id=?", c.peerId)
      .toArray()[0];
    return (
      !!row &&
      row.expiresAt > Date.now() &&
      this.peerExpiry(c.peerId) > 0 &&
      equalHash(row.hash, c.hash)
    );
  }
  peerExpiry(peerId: string): number {
    return (
      this.ctx.storage.sql
        .exec<{ expiresAt: number }>(
          "SELECT expiresAt FROM peers WHERE id=? AND e2ee=1 AND expiresAt>?",
          peerId,
          Date.now(),
        )
        .toArray()[0]?.expiresAt ?? 0
    );
  }
  async addPeer(
    owner: Credential,
    peerId: string,
    hash: string,
    kind: string = "web",
  ): Promise<boolean> {
    if (owner.peerId !== "owner" || !this.authorize(owner)) return false;
    this.ctx.storage.sql.exec(
      "DELETE FROM peers WHERE expiresAt<=? OR e2ee=0",
      Date.now(),
    );
    if (
      this.ctx.storage.sql.exec("SELECT id FROM peers").toArray().length >= 20
    )
      return false;
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO peers(id,hash,name,expiresAt,createdAt,e2ee,kind) VALUES (?,?,?,?,?,1,?)",
      peerId,
      hash,
      kind === "native" ? "已配对设备" : "已配对网页",
      Date.now() + (kind === "native" ? 365 : 7) * 86400_000,
      Date.now(),
      kind,
    );
    await this.scheduleExpiry();
    return true;
  }
  listPeers(owner: Credential) {
    if (owner.peerId !== "owner" || !this.authorize(owner)) return null;
    return this.ctx.storage.sql
      .exec<Omit<Peer, "hash">>(
        "SELECT id,name,expiresAt,createdAt,kind FROM peers WHERE expiresAt>? ORDER BY createdAt DESC",
        Date.now(),
      )
      .toArray();
  }
  revoke(c: Credential, peerId: string): boolean {
    if (
      !this.authorize(c) ||
      (c.peerId !== "owner" && c.peerId !== peerId) ||
      peerId === "owner"
    )
      return false;
    this.ctx.storage.sql.exec("DELETE FROM peers WHERE id=?", peerId);
    for (const ws of this.ctx.getWebSockets(peerId)) {
      try {
        ws.send('{"type":"revoked"}');
        ws.close(4001, "Pairing revoked");
      } catch {}
    }
    return true;
  }
  private ownerSockets() {
    return this.ctx
      .getWebSockets("owner")
      .filter((ws) => ws.readyState === WebSocket.OPEN);
  }
  private broadcast(value: unknown) {
    const text = JSON.stringify(value);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (a.peerId !== "owner" && this.valid(a)) {
        try {
          ws.send(text);
        } catch {}
      }
    }
  }
  private valid(a: Attachment) {
    if (a.protocol !== 3) return false;
    return (
      a.peerId === "owner" ||
      (a.expiresAt > Date.now() &&
        this.ctx.storage.sql
          .exec(
            "SELECT id FROM peers WHERE id=? AND e2ee=1 AND expiresAt>?",
            a.peerId,
            Date.now(),
          )
          .toArray().length > 0)
    );
  }
  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).searchParams.get("v") !== "3")
      return Response.json(
        { error: "请更新客户端并重新配对，本站要求端到端加密" },
        { status: 426 },
      );
    const c = await credential(request);
    if (!c || !this.authorize(c))
      return Response.json({ error: "配对已失效" }, { status: 401 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response(null, { status: 426 });
    if (this.ctx.getWebSockets(c.peerId).length >= 8 && c.peerId !== "owner")
      return Response.json({ error: "连接过多" }, { status: 429 });
    if (c.peerId === "owner")
      for (const old of this.ownerSockets())
        old.close(4000, "New phone connection");
    const [client, server] = Object.values(new WebSocketPair());
    const expiresAt =
      c.peerId === "owner"
        ? Number.MAX_SAFE_INTEGER
        : this.ctx.storage.sql
            .exec<Peer>("SELECT * FROM peers WHERE id=?", c.peerId)
            .one().expiresAt;
    this.ctx.acceptWebSocket(server, [c.peerId]);
    server.serializeAttachment({
      peerId: c.peerId,
      expiresAt,
      connectionId: crypto.randomUUID(),
      protocol: 3,
      kind: c.peerId === "owner" ? "native" : this.ctx.storage.sql.exec<Peer>("SELECT * FROM peers WHERE id=?", c.peerId).one().kind,
    } satisfies Attachment);
    server.send(
      JSON.stringify({
        type: "ready",
        protocolVersion: 3,
        connectionId: (server.deserializeAttachment() as Attachment)
          .connectionId,
        phoneOnline: this.ownerSockets().length > 0,
      }),
    );
    if (c.peerId === "owner")
      this.broadcast({ type: "presence", phoneOnline: true });
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as Attachment;
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!this.valid(a)) {
      ws.close(4001, "Pairing expired");
      return;
    }
    if (
      typeof raw !== "string" ||
      new TextEncoder().encode(raw).length > MAX_FRAME
    ) {
      ws.close(1009, "Message too large");
      return;
    }
    try {
      const m = JSON.parse(raw) as Record<string, unknown>;
      if (
        !m ||
        m.v !== 1 ||
        !["hello", "welcome", "sealed"].includes(String(m.type)) ||
        typeof m.clientNonce !== "string" ||
        !hex32.test(m.clientNonce)
      )
        throw new Error();
      const clean: Record<string, unknown> = {
        type: m.type,
        v: 1,
        clientNonce: m.clientNonce,
      };
      if (m.type !== "hello") {
        if (
          typeof m.phoneNonce !== "string" ||
          !hex32.test(m.phoneNonce) ||
          !Number.isSafeInteger(m.seq) ||
          Number(m.seq) < 1 ||
          Number(m.seq) > 0xffffffff ||
          typeof m.ciphertext !== "string" ||
          m.ciphertext.length < 24 ||
          m.ciphertext.length > 1_066_688 ||
          m.ciphertext.length % 4 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(m.ciphertext)
        )
          throw new Error();
        Object.assign(clean, {
          phoneNonce: m.phoneNonce,
          seq: m.seq,
          ciphertext: m.ciphertext,
        });
      }
      if (a.peerId === "owner") {
        if (
          m.type === "hello" ||
          typeof m.peerId !== "string" ||
          !uuid.test(m.peerId) ||
          typeof m.connectionId !== "string" ||
          !uuid.test(m.connectionId)
        )
          throw new Error();
        for (const browser of this.ctx.getWebSockets(m.peerId)) {
          const target = browser.deserializeAttachment() as Attachment;
          if (target.connectionId === m.connectionId && this.valid(target))
            browser.send(JSON.stringify(clean));
        }
        return;
      }
      if (m.type === "welcome") throw new Error();
      if (!a.window || Date.now() - a.window > 60_000) {
        a.window = Date.now();
        a.count = 0;
      }
      a.count = (a.count ?? 0) + 1;
      ws.serializeAttachment(a);
      if (a.count > (a.kind === "native" ? 2400 : 240)) {
        ws.close(1008, "Too many requests");
        return;
      }
      const phone = this.ownerSockets().at(-1);
      if (!phone) {
        ws.send('{"type":"presence","phoneOnline":false}');
        return;
      }
      // Only an allowlisted opaque envelope is routed. No note IDs, operations,
      // plaintext bodies, cryptographic keys or errors enter relay storage/logs.
      phone.send(
        JSON.stringify({
          ...clean,
          peerId: a.peerId,
          connectionId: a.connectionId,
        }),
      );
    } catch {
      ws.close(1008, "Encrypted protocol required");
    }
  }

  webSocketClose(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Attachment;
    if (a.peerId !== "owner") {
      for (const phone of this.ownerSockets()) {
        try {
          phone.send(
            JSON.stringify({
              type: "peer-disconnected",
              connectionId: a.connectionId,
            }),
          );
        } catch {}
      }
    }
    if (a.peerId === "owner")
      this.broadcast({
        type: "presence",
        phoneOnline: this.ownerSockets().some((other) => other !== ws),
      });
  }
  webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, "Connection error");
    } catch {}
    this.webSocketClose(ws);
  }
  private async scheduleExpiry() {
    const next = this.ctx.storage.sql
      .exec<{ at: number | null }>("SELECT MIN(expiresAt) AS at FROM peers")
      .one().at;
    if (next) await this.ctx.storage.setAlarm(next);
  }
  async alarm() {
    for (const row of this.ctx.storage.sql
      .exec<{
        id: string;
      }>("SELECT id FROM peers WHERE expiresAt<=?", Date.now())
      .toArray()) {
      for (const ws of this.ctx.getWebSockets(row.id))
        ws.close(4001, "Pairing expired");
    }
    this.ctx.storage.sql.exec(
      "DELETE FROM peers WHERE expiresAt<=? OR e2ee=0",
      Date.now(),
    );
    await this.scheduleExpiry();
  }
}

type PairRecord = {
  hash: string;
  expiresAt: number;
  deviceId: string | null;
  peerId: string | null;
  approved: number;
  e2ee: number;
  kind: string;
};
export class PairingRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS pairing (id INTEGER PRIMARY KEY CHECK(id=1),hash TEXT NOT NULL,expiresAt INTEGER NOT NULL,deviceId TEXT,peerId TEXT,approved INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS rate (id INTEGER PRIMARY KEY CHECK(id=1),count INTEGER NOT NULL,resetAt INTEGER NOT NULL);",
    );
    if (
      !ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(pairing)")
        .toArray()
        .some((c) => c.name === "e2ee")
    ) {
      ctx.storage.sql.exec(
        "ALTER TABLE pairing ADD COLUMN e2ee INTEGER NOT NULL DEFAULT 0",
      );
    }
    if (!ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(pairing)").toArray().some(c => c.name === "kind")) {
      ctx.storage.sql.exec("ALTER TABLE pairing ADD COLUMN kind TEXT NOT NULL DEFAULT 'web'");
    }
  }
  async limit(maximum: number): Promise<boolean> {
    const row = this.ctx.storage.sql
      .exec<{ count: number; resetAt: number }>("SELECT * FROM rate WHERE id=1")
      .toArray()[0];
    if (!row || row.resetAt <= Date.now()) {
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO rate VALUES(1,1,?)",
        Date.now() + 60_000,
      );
      await this.ctx.storage.setAlarm(Date.now() + 120_000);
      return true;
    }
    if (row.count >= maximum) return false;
    this.ctx.storage.sql.exec("UPDATE rate SET count=count+1 WHERE id=1");
    return true;
  }
  async create(hash: string, kind: string = "web"): Promise<number | null> {
    if (this.ctx.storage.sql.exec("SELECT id FROM pairing").toArray().length)
      return null;
    const expiresAt = Date.now() + 300_000;
    this.ctx.storage.sql.exec(
      "INSERT INTO pairing(id,hash,expiresAt,e2ee,kind) VALUES(1,?,?,1,?)",
      hash,
      expiresAt,
      kind,
    );
    await this.ctx.storage.setAlarm(expiresAt);
    return expiresAt;
  }
  status(hash: string) {
    const row = this.ctx.storage.sql
      .exec<PairRecord>("SELECT * FROM pairing WHERE id=1")
      .toArray()[0];
    if (
      !row ||
      row.e2ee !== 1 ||
      row.expiresAt <= Date.now() ||
      !equalHash(row.hash, hash)
    )
      return null;
    return {
      approved: !!row.approved,
      kind: row.kind,
      deviceId: row.deviceId,
      peerId: row.peerId,
      expiresAt: row.expiresAt,
    };
  }
  async approve(
    owner: Credential,
  ): Promise<{ result: string; peerId?: string; expiresAt?: number; kind?: string }> {
    const room = this.env.RELAY.getByName(owner.deviceId);
    if (owner.peerId !== "owner" || !(await room.authorize(owner)))
      return { result: "unauthorized" };
    const row = this.ctx.storage.sql
      .exec<PairRecord>("SELECT * FROM pairing WHERE id=1")
      .toArray()[0];
    if (!row || row.e2ee !== 1 || row.expiresAt <= Date.now())
      return { result: "expired" };
    if (row.deviceId && row.deviceId !== owner.deviceId)
      return { result: "claimed" };
    if (row.approved)
      return {
        result: "ok",
        kind: row.kind,
        peerId: row.peerId!,
        expiresAt: await room.peerExpiry(row.peerId!),
      };
    const peerId = row.peerId ?? crypto.randomUUID();
    // Reserve synchronously before the cross-object call; a second phone cannot steal the pair.
    this.ctx.storage.sql.exec(
      "UPDATE pairing SET deviceId=?,peerId=? WHERE id=1",
      owner.deviceId,
      peerId,
    );
    if (!(await room.addPeer(owner, peerId, row.hash, row.kind)))
      return { result: "limit" };
    this.ctx.storage.sql.exec("UPDATE pairing SET approved=1 WHERE id=1");
    return { result: "ok", kind: row.kind, peerId, expiresAt: await room.peerExpiry(peerId) };
  }
  async alarm() {
    this.ctx.storage.sql.exec("DELETE FROM pairing; DELETE FROM rate;");
  }
}
