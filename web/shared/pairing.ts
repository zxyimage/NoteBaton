/** Codes live in the fragment so HTTP requests and access logs omit them. */
export function pairingLink(origin: string, code: string, key: string): string {
  const base = new URL(origin);
  if (!/^RLY-[A-F0-9]{4}(-[A-F0-9]{4}){3}$/.test(code))
    throw new Error("Invalid pairing code");
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid pairing key");
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !["/", ""].includes(base.pathname)
  )
    throw new Error("Expected a service origin");
  if (
    base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
    )
  )
    throw new Error("HTTPS required");
  const url = new URL("/pair", base);
  url.hash = new URLSearchParams({ v: "2", code, key }).toString();
  return url.href;
}
