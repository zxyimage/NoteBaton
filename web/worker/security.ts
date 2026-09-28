export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function digest(value: string): Promise<string> {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}
export function hex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [format, iterations, salt, expected] = encoded.split(":");
  if (
    format !== "pbkdf2" ||
    iterations !== "100000" ||
    !/^[a-f0-9]{32}$/.test(salt ?? "") ||
    !/^[a-f0-9]{64}$/.test(expected ?? "")
  ) {
    throw new HttpError(503, "服务端账号尚未配置完成");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const actual = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
    },
    key,
    256,
  );
  const target = Uint8Array.from(expected.match(/.{2}/g)!, (byte) =>
    parseInt(byte, 16),
  );
  return crypto.subtle.timingSafeEqual(actual, target);
}
export function tokenFrom(request: Request): string {
  const bearer = request.headers.get("Authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice(7);
  return (
    request.headers
      .get("Cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("relay_session="))
      ?.slice(14) ?? ""
  );
}
export async function sessionHash(request: Request): Promise<string> {
  const token = tokenFrom(request);
  return /^[a-f0-9]{64}$/.test(token) ? digest(token) : "";
}
export async function readJSON(
  request: Request,
  maximum = 800_000,
): Promise<Record<string, unknown>> {
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new HttpError(415, "请使用 JSON 请求");
  if (!request.body) throw new HttpError(400, "请求内容不能为空");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new HttpError(413, "请求内容过长");
    }
    parts.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(joined));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "请求格式不正确");
  }
}
