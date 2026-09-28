// Protocol specification and threat model: docs/端到端加密.md.
export const E2EE_VERSION = 1;
export const MAX_PLAINTEXT = 800_000;
export const MAX_FRAME = 1_100_000;
export const hex32 = /^[a-f0-9]{64}$/;
export const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
export function randomHex(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function unhex(value: string): Uint8Array<ArrayBuffer> {
  if (!hex32.test(value)) throw new Error("Invalid encryption material");
  return Uint8Array.from(value.match(/../g)!, (b) => parseInt(b, 16));
}
function base64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let text = "";
  for (let i = 0; i < bytes.length; i += 32768)
    text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}
function unbase64(value: string): Uint8Array<ArrayBuffer> {
  if (
    value.length > 1_066_688 ||
    value.length < 24 ||
    value.length % 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw new Error("Invalid ciphertext");
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (bytes.length < 16 || bytes.length > MAX_PLAINTEXT + 16)
    throw new Error("Invalid ciphertext");
  return bytes;
}
export function importPairKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", unhex(secret), "HKDF", false, [
    "deriveKey",
  ]);
}
export type ChannelContext = {
  origin: string;
  deviceId: string;
  peerId: string;
  connectionId: string;
  clientNonce: string;
  phoneNonce: string;
};
export type SealedFrame = {
  type: "sealed" | "welcome";
  v: 1;
  clientNonce: string;
  phoneNonce: string;
  seq: number;
  ciphertext: string;
};
function iv(seq: number): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(seq) || seq < 1 || seq > 0xffffffff)
    throw new Error("Encryption sequence exhausted");
  const bytes = new Uint8Array(12);
  new DataView(bytes.buffer).setUint32(8, seq, false);
  return bytes;
}
export class EncryptedChannel {
  private sent = 0;
  private received = 0;
  private constructor(
    readonly context: ChannelContext,
    private label: string,
    private outgoing: CryptoKey,
    private incoming: CryptoKey,
    private sendDirection: string,
    private receiveDirection: string,
  ) {}
  static async create(
    key: CryptoKey,
    c: ChannelContext,
    role: "browser" | "phone",
  ): Promise<EncryptedChannel> {
    if (
      ![c.deviceId, c.peerId, c.connectionId].every((v) => uuid.test(v)) ||
      new URL(c.origin).origin !== c.origin
    )
      throw new Error("Invalid encryption context");
    const salt = new Uint8Array(64);
    salt.set(unhex(c.clientNonce));
    salt.set(unhex(c.phoneNonce), 32);
    const label = [
      "relay-e2ee-v1",
      c.origin,
      c.deviceId,
      c.peerId,
      c.connectionId,
      c.clientNonce,
      c.phoneNonce,
    ].join("\n");
    const derive = (direction: string) =>
      crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt,
          info: encoder.encode(`${label}\n${direction}`),
        },
        key,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    const [b2p, p2b] = await Promise.all([
      derive("browser-to-phone"),
      derive("phone-to-browser"),
    ]);
    return new EncryptedChannel(
      c,
      label,
      role === "browser" ? b2p : p2b,
      role === "browser" ? p2b : b2p,
      role === "browser" ? "browser-to-phone" : "phone-to-browser",
      role === "browser" ? "phone-to-browser" : "browser-to-phone",
    );
  }
  // Callers serialize asynchronous sends/receives in WebSocket order.
  async seal(
    value: unknown,
    type: SealedFrame["type"] = "sealed",
  ): Promise<SealedFrame> {
    const data = encoder.encode(JSON.stringify(value));
    if (data.length > MAX_PLAINTEXT)
      throw new Error("Encrypted message too large");
    const seq = ++this.sent;
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv(seq),
        tagLength: 128,
        additionalData: encoder.encode(
          `${this.label}\n${this.sendDirection}\n${seq}`,
        ),
      },
      this.outgoing,
      data,
    );
    return {
      type,
      v: 1,
      clientNonce: this.context.clientNonce,
      phoneNonce: this.context.phoneNonce,
      seq,
      ciphertext: base64(ciphertext),
    };
  }
  async open(frame: SealedFrame): Promise<Record<string, unknown>> {
    if (
      frame.v !== 1 ||
      frame.clientNonce !== this.context.clientNonce ||
      frame.phoneNonce !== this.context.phoneNonce ||
      frame.seq !== this.received + 1 ||
      typeof frame.ciphertext !== "string"
    )
      throw new Error("Encrypted message context or sequence mismatch");
    const data = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv(frame.seq),
        tagLength: 128,
        additionalData: encoder.encode(
          `${this.label}\n${this.receiveDirection}\n${frame.seq}`,
        ),
      },
      this.incoming,
      unbase64(frame.ciphertext),
    );
    const value: unknown = JSON.parse(decoder.decode(data));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid encrypted payload");
    this.received = frame.seq;
    return value as Record<string, unknown>;
  }
}
