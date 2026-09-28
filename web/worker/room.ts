import type { LegacyEnvironment } from "./legacy-env";
import { DurableObject } from "cloudflare:workers";
import { HttpError, digest, hex, verifyPassword } from "./security";
type Session = { hash: string; expiresAt: number; configTag: string };
type Clip = {
  seq: number;
  id: string;
  text: string;
  source: string;
  createdAt: number;
};
type RPCRequest = {
  action: string;
  hash: string;
  configTag: string;
  payload: Record<string, unknown>;
};
// Read-only bridge for v1 installations. No v2 note ever enters this object.
export class ClipboardRoom extends DurableObject<LegacyEnvironment> {
  constructor(ctx: DurableObjectState, env: LegacyEnvironment) {
    super(ctx, env);
    ctx.storage.sql
      .exec(`CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value INTEGER NOT NULL); INSERT OR IGNORE INTO meta VALUES('version',0);
   CREATE TABLE IF NOT EXISTS clips(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,text TEXT NOT NULL,source TEXT NOT NULL,createdAt INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,digest TEXT NOT NULL,clipId TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,expiresAt INTEGER NOT NULL,configTag TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,resetAt INTEGER NOT NULL);`);
  }
  async migrationLogin(
    username: unknown,
    password: unknown,
    configTag: string,
  ) {
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      password.length > 1024 ||
      username.length > 200 ||
      !this.env.LOGIN_PASSWORD_HASH
    )
      return null;
    const attempt = this.ctx.storage.sql
      .exec<{
        count: number;
        resetAt: number;
      }>("SELECT * FROM attempts WHERE key='migration'")
      .toArray()[0];
    if (attempt && attempt.resetAt > Date.now() && attempt.count >= 10)
      return null;
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO attempts VALUES('migration',?,?)",
      attempt && attempt.resetAt > Date.now() ? attempt.count + 1 : 1,
      Date.now() + 900_000,
    );
    if (
      !(await verifyPassword(password, this.env.LOGIN_PASSWORD_HASH)) ||
      username !== this.env.LOGIN_USERNAME
    )
      return null;
    const token = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
    this.ctx.storage.sql.exec(
      "INSERT INTO sessions VALUES(?,?,?)",
      await digest(token),
      Date.now() + 600_000,
      configTag,
    );
    return { token };
  }
  async api(input: RPCRequest) {
    try {
      const session = this.ctx.storage.sql
        .exec<Session>("SELECT * FROM sessions WHERE hash=?", input.hash)
        .toArray()[0];
      if (
        !session ||
        session.expiresAt <= Date.now() ||
        session.configTag !== input.configTag
      )
        throw new HttpError(401, "旧版登录已过期，无法自动迁移");
      if (input.action === "migrate-finish") {
        const ids = input.payload.ids;
        const stored = this.ctx.storage.sql
          .exec<{ id: string }>("SELECT id FROM clips")
          .toArray();
        if (!Array.isArray(ids) || !stored.every((row) => ids.includes(row.id)))
          throw new HttpError(409, "旧笔记尚未全部保存到手机");
        this.ctx.storage.sql.exec(
          "DELETE FROM clips; DELETE FROM requests; DELETE FROM attempts; UPDATE meta SET value=0;",
        );
        await this.ctx.storage.sync();
        for (const ws of this.ctx.getWebSockets()) {
          try {
            ws.close(4001, "Moved to phone");
          } catch {}
        }
        // Keep only the expiring session metadata so a lost finish acknowledgement can retry.
        return { status: 200, body: { ok: true } };
      }
      if (input.action !== "list")
        throw new HttpError(404, "旧版服务仅支持迁移");
      const before = input.payload.before
        ? Number(input.payload.before)
        : Number.MAX_SAFE_INTEGER;
      if (!Number.isSafeInteger(before) || before < 1)
        throw new HttpError(400, "分页参数不正确");
      const rows = this.ctx.storage.sql
        .exec<Clip>(
          "SELECT * FROM clips WHERE seq<? ORDER BY seq DESC LIMIT 51",
          before,
        )
        .toArray();
      const items = rows.slice(0, 50);
      return {
        status: 200,
        body: {
          items,
          version: 0,
          nextCursor: rows.length > 50 ? items.at(-1)!.seq : null,
        },
      };
    } catch (error) {
      return {
        status: error instanceof HttpError ? error.status : 500,
        body: {
          error:
            error instanceof HttpError ? error.message : "旧笔记迁移暂时不可用",
        },
      };
    }
  }
  webSocketMessage(ws: WebSocket) {
    ws.close(4001, "Upgrade the app");
  }
  webSocketClose() {}
  webSocketError() {}
  async alarm() {
    this.ctx.storage.sql.exec(
      "DELETE FROM sessions WHERE expiresAt<=?",
      Date.now(),
    );
  }
}
