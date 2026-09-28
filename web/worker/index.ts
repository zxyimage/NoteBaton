import type { LegacyEnvironment } from "./legacy-env";
import { digest, hex, HttpError, readJSON, sessionHash } from "./security";
import { credential, randomSecret, secretPattern, uuidPattern } from "./relay";
export { ClipboardRoom } from "./room";
export { RelayRoom, PairingRoom } from "./relay";

function secure(response: Response): Response {
  if (response.status === 101) return response;
  const result = new Response(response.body, response);
  result.headers.set("Cache-Control", "no-store");
  result.headers.set("X-Content-Type-Options", "nosniff");
  result.headers.set("Referrer-Policy", "no-referrer");
  result.headers.set("Strict-Transport-Security", "max-age=31536000");
  result.headers.set("X-Frame-Options", "DENY");
  result.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  result.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return result;
}
function cookie(value: string, request: Request, seconds = 604800): string {
  return `relay_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
const cleanCode = (value: unknown) =>
  typeof value === "string"
    ? value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .replace(/^RLY/, "")
    : "";

export const createWorker = (site = false) => ({
  async fetch(request: Request, env: LegacyEnvironment): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (
        url.protocol !== "https:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ) {
        url.protocol = "https:";
        return Response.redirect(url.href, 308);
      }
      if (!url.pathname.startsWith("/api/")) {
        if (!site) {
          if (request.method !== "GET" && request.method !== "HEAD")
            return secure(new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } }));
          if (["/", "/index.html", "/note", "/note/", "/pair", "/pair/"].includes(url.pathname)) {
            // Assets canonicalizes /index.html back to /. Fetch / directly to
            // serve the workspace without a redirect loop or losing fragments.
            url.pathname = "/";
            return secure(await env.ASSETS.fetch(new Request(url, request)));
          }
          if (!url.pathname.startsWith("/assets/") &&
              !["/favicon.svg", "/third-party-notices.txt"].includes(url.pathname))
            return secure(new Response("Not found", { status: 404 }));
        }
        return secure(await env.ASSETS.fetch(request));
      }
      const origin = request.headers.get("Origin");
      if (
        (origin && origin !== url.origin) ||
        request.headers.get("Sec-Fetch-Site") === "cross-site"
      )
        throw new HttpError(403, "请求来源不受信任");
      const respond = (body: unknown, status = 200, headers?: HeadersInit) =>
        secure(Response.json(body, { status, headers }));
      const limited = async (bucket: string, max: number) => {
        const key = await digest(
          request.headers.get("CF-Connecting-IP") ?? "local",
        );
        if (!(await env.PAIRING.getByName(`rate:${bucket}:${key}`).limit(max)))
          throw new HttpError(429, "操作过于频繁，请稍后重试");
      };
      if (request.method === "GET" && url.pathname === "/api/info") {
        return respond({
          product: "relay-clipboard",
          protocolVersion: 3,
          pairingLinkVersion: 2,
          e2eeVersion: 1,
          storage: "device",
          replicaVersion: 1,
          maxNoteCharacters: 100000,
          pageSize: 10,
        });
      }
      if (url.pathname === "/api/legacy/login" && request.method === "POST") {
        await limited("legacy", 10);
        const p = await readJSON(request, 4096);
        const result = await env.CLIPBOARD.getByName(
          "private-owner-v1",
        ).migrationLogin(
          p.username,
          p.password,
          await digest(env.LOGIN_PASSWORD_HASH ?? ""),
        );
        if (!result) throw new HttpError(401, "旧版账号无效或尝试过于频繁");
        return respond(result);
      }
      // Legacy is read-only. Only an existing v1 session can migrate; no new v1 writes/logins.
      if (
        url.pathname === "/api/legacy/clips" ||
        url.pathname === "/api/legacy/finish"
      ) {
        if (
          request.method !== (url.pathname.endsWith("finish") ? "POST" : "GET")
        )
          throw new HttpError(405, "请求方式不正确");
        const payload = url.pathname.endsWith("finish")
          ? await readJSON(request)
          : { before: url.searchParams.get("before"), since: null };
        const result = await env.CLIPBOARD.getByName("private-owner-v1").api({
          action: url.pathname.endsWith("finish") ? "migrate-finish" : "list",
          hash: await sessionHash(request),
          configTag: await digest(env.LOGIN_PASSWORD_HASH ?? ""),
          payload,
        });
        return respond(result.body, result.status);
      }
      if (request.method === "POST" && url.pathname === "/api/register") {
        await limited("register", 20);
        const p = await readJSON(request, 2048);
        if (
          typeof p.deviceId !== "string" ||
          !uuidPattern.test(p.deviceId) ||
          typeof p.secret !== "string" ||
          !secretPattern.test(p.secret)
        )
          throw new HttpError(400, "设备身份不正确");
        if (
          !(await env.RELAY.getByName(p.deviceId).register(
            await digest(p.secret),
          ))
        )
          throw new HttpError(409, "设备身份不匹配");
        return respond({ ok: true });
      }
      if (request.method === "POST" && url.pathname === "/api/pair") {
        await limited("pair", 10);
        const pairing = await readJSON(request, 2048);
        if (pairing.e2eeVersion !== 1)
          throw new HttpError(426, "请更新网页以使用端到端加密");
        const code = hex(
          crypto.getRandomValues(new Uint8Array(8)).buffer,
        ).toUpperCase();
        const secret = randomSecret();
        const expiresAt = await env.PAIRING.getByName(`pair:${code}`).create(
          await digest(secret),
          pairing.clientType === "native" ? "native" : "web",
        );
        if (!expiresAt) throw new HttpError(503, "请重新生成配对码");
        return respond({
          code: `RLY-${code.match(/.{4}/g)!.join("-")}`,
          secret,
          expiresAt,
        });
      }
      if (request.method === "POST" && url.pathname === "/api/pair/status") {
        await limited("poll", 180);
        const p = await readJSON(request, 2048);
        const code = cleanCode(p.code);
        if (
          !/^[A-F0-9]{16}$/.test(code) ||
          typeof p.secret !== "string" ||
          !secretPattern.test(p.secret)
        )
          throw new HttpError(400, "配对信息不正确");
        const result = await env.PAIRING.getByName(`pair:${code}`).status(
          await digest(p.secret),
        );
        if (!result) throw new HttpError(410, "配对码已过期，请重新生成");
        if (!result.approved) return respond({ approved: false });
        const token = `${result.deviceId}.${result.peerId}.${p.secret}`;
        if (result.kind === "native") {
          const expiresAt = await env.RELAY.getByName(result.deviceId!).peerExpiry(result.peerId!);
          if (!expiresAt) throw new HttpError(410, "配对已失效，请重新配对");
          return respond({ approved: true, token, deviceId: result.deviceId, peerId: result.peerId, expiresAt });
        }
        return respond({ approved: true }, 200, {
          "Set-Cookie": cookie(token, request),
        });
      }
      const c = await credential(request);
      if (!c) throw new HttpError(401, "请先使用手机配对");
      const room = env.RELAY.getByName(c.deviceId);
      if (url.pathname === "/api/events" && request.method === "GET")
        return room.fetch(request);
      if (!(await room.authorize(c)))
        throw new HttpError(401, "配对已失效，请重新配对");
      if (request.method === "GET" && url.pathname === "/api/session")
        return respond({
          deviceId: c.deviceId,
          peerId: c.peerId,
          expiresAt: await room.peerExpiry(c.peerId),
          e2eeVersion: 1,
        });
      if (request.method === "POST" && url.pathname === "/api/pair/approve") {
        if (c.peerId !== "owner")
          throw new HttpError(403, "请在手机上确认配对");
        await limited("approve", 20);
        const p = await readJSON(request, 2048);
        if (p.e2eeVersion !== 1)
          throw new HttpError(426, "请更新 App 以使用端到端加密");
        const code = cleanCode(p.code);
        if (!/^[A-F0-9]{16}$/.test(code))
          throw new HttpError(400, "配对码格式不正确");
        const result = await env.PAIRING.getByName(`pair:${code}`).approve(c);
        if (result.result !== "ok")
          throw new HttpError(
            result.result === "expired" ? 410 : 409,
            result.result === "limit"
              ? "已配对网页过多，请先移除旧设备"
              : "配对码已过期或已被使用",
          );
        return respond({
          ok: true,
          peerId: result.peerId,
          kind: result.kind,
          expiresAt: result.expiresAt,
        });
      }
      if (request.method === "GET" && url.pathname === "/api/peers") {
        const peers = await room.listPeers(c);
        if (!peers) throw new HttpError(403, "仅手机可管理配对");
        return respond({ peers });
      }
      if (
        request.method === "DELETE" &&
        url.pathname.startsWith("/api/peers/")
      ) {
        if (!(await room.revoke(c, url.pathname.split("/").at(-1)!)))
          throw new HttpError(403, "无法移除此配对");
        return respond({ ok: true });
      }
      if (request.method === "POST" && url.pathname === "/api/logout") {
        if (c.peerId === "owner")
          throw new HttpError(400, "请在手机管理网页配对");
        await room.revoke(c, c.peerId);
        return respond({ ok: true }, 200, {
          "Set-Cookie": cookie("", request, 0),
        });
      }
      throw new HttpError(404, "接口不存在");
    } catch (error) {
      return secure(
        Response.json(
          {
            error:
              error instanceof HttpError
                ? error.message
                : "服务暂时不可用，请重试",
          },
          { status: error instanceof HttpError ? error.status : 500 },
        ),
      );
    }
  },
} satisfies ExportedHandler<LegacyEnvironment>);

export default createWorker();
