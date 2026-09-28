import { useCallback, useEffect, useRef, useState } from "react";
import { api, APIError, type Cursor, type Note, type Session } from "../api";
import {
  EncryptedChannel,
  randomHex,
  uuid,
  MAX_FRAME,
  type SealedFrame,
} from "../../shared/e2ee";
import { loadPairKey } from "../pairKeys";
type Reply = {
  type: string;
  requestId?: string;
  kind?: string;
  note?: Note;
  cursor?: Cursor | null;
  hasMore?: boolean;
  phoneOnline?: boolean;
  error?: string;
  removedIds?: string[];
};
type Page = { items: Note[]; cursor: Cursor | null; hasMore: boolean };
type Pending = {
  items: Note[];
  resolve: (value: Reply & Partial<Page>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
const sortNotes = (items: Note[]) =>
  items.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
export function useRelay(session: Session, onExpired: () => void) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [online, setOnline] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const channel = useRef<EncryptedChannel | null>(null);
  const outbound = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(new Map<string, Pending>());
  const cursor = useRef<Cursor | null>(null);
  const fetching = useRef(false);
  const queued = useRef(false);
  const initial = useRef(true);
  const loaded = useRef<Note[]>([]);
  const request = useCallback(
    (action: string, body: Record<string, unknown> = {}) =>
      new Promise<Reply & Partial<Page>>((resolve, reject) => {
        if (socket.current?.readyState !== WebSocket.OPEN || !channel.current) {
          reject(new Error("连接已断开，内容暂未发送"));
          return;
        }
        const requestId = crypto.randomUUID();
        const timer = setTimeout(() => {
          pending.current.delete(requestId);
          reject(new Error("设备暂未响应，草稿已保留，请打开已配对的 App"));
        }, 12000);
        pending.current.set(requestId, { items: [], resolve, reject, timer });
        const ws = socket.current,
          secure = channel.current;
        outbound.current = outbound.current
          .then(async () => {
            if (socket.current !== ws || channel.current !== secure)
              throw new Error("加密连接已更新，请重试");
            const frame = await secure.seal({
              type: "request",
              requestId,
              action,
              ...body,
            });
            if (
              socket.current !== ws ||
              channel.current !== secure ||
              ws.readyState !== WebSocket.OPEN
            )
              throw new Error("连接已断开");
            ws.send(JSON.stringify(frame));
          })
          .catch(() => {
            const p = pending.current.get(requestId);
            if (p) {
              clearTimeout(p.timer);
              pending.current.delete(requestId);
              p.reject(new Error("加密发送失败，草稿已保留"));
            }
            ws.close();
          });
      }),
    [],
  );
  const refresh = useCallback(
    async (more = false) => {
      if (fetching.current) {
        if (!more) queued.current = true;
        return;
      }
      fetching.current = true;
      setLoading(true);
      try {
        const result = await request("list", {
          cursor: more ? cursor.current : null,
          knownIds: loaded.current.slice(0, 2000).map((n) => n.id),
        });
        const items = result.items ?? [];
        const reset = initial.current;
        initial.current = false;
        const removed = new Set(result.removedIds ?? []);
        const wasExpanded = loaded.current.length > 10;
        const map = new Map(
          (reset ? [] : loaded.current)
            .filter((n) => !removed.has(n.id))
            .map((n) => [n.id, n]),
        );
        for (const note of items) map.set(note.id, note);
        const sorted = sortNotes([...map.values()]);
        loaded.current = sorted;
        cursor.current = sorted.length
          ? { id: sorted.at(-1)!.id, updatedAt: sorted.at(-1)!.updatedAt }
          : null;
        setNotes(sorted);
        if (more || !wasExpanded) setHasMore(result.hasMore ?? false);
        setError("");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        fetching.current = false;
        setLoading(false);
        if (queued.current) {
          queued.current = false;
          void refresh();
        }
      }
    },
    [request],
  );
  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    let delay = 1000;
    let last = Date.now();
    const keyPromise = loadPairKey(session);
    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/events?v=3`,
      );
      socket.current = ws;
      let incoming = Promise.resolve();
      let connectionId = "",
        clientNonce = "";
      let handshake: ReturnType<typeof setTimeout>;
      const beginHandshake = () => {
        clearTimeout(handshake);
        channel.current = null;
        setOnline(false);
        clientNonce = randomHex();
        const hello = () => {
          if (
            stopped ||
            socket.current !== ws ||
            ws.readyState !== WebSocket.OPEN ||
            channel.current
          )
            return;
          ws.send(JSON.stringify({ type: "hello", v: 1, clientNonce }));
          handshake = setTimeout(hello, 2000);
        };
        hello();
      };
      ws.onopen = () => {
        delay = 1000;
        last = Date.now();
        setConnected(true);
      };
      ws.onmessage = (event) => {
        last = Date.now();
        if (event.data === "pong") return;
        incoming = incoming
          .then(async () => {
            if (stopped || socket.current !== ws) return;
            if (
              typeof event.data !== "string" ||
              new TextEncoder().encode(event.data).length > MAX_FRAME
            )
              throw new Error();
            const envelope = JSON.parse(event.data);
            if (envelope.type === "revoked") {
              onExpired();
              return;
            }
            if (envelope.type === "ready") {
              if (
                envelope.protocolVersion !== 3 ||
                !uuid.test(envelope.connectionId)
              )
                throw new Error();
              connectionId = envelope.connectionId;
              if (envelope.phoneOnline) beginHandshake();
              return;
            }
            if (envelope.type === "presence") {
              if (envelope.phoneOnline) beginHandshake();
              else {
                channel.current = null;
                setOnline(false);
                clearTimeout(handshake);
              }
              return;
            }
            if (envelope.type !== "welcome" && envelope.type !== "sealed")
              throw new Error();
            if (envelope.clientNonce !== clientNonce) return; // Late packet from an abandoned connection handshake.
            if (envelope.type === "welcome") {
              if (channel.current) return;
              const key = await keyPromise;
              if (!key) {
                onExpired();
                return;
              }
              const secure = await EncryptedChannel.create(
                key,
                {
                  origin: location.origin,
                  deviceId: session.deviceId,
                  peerId: session.peerId,
                  connectionId,
                  clientNonce,
                  phoneNonce: envelope.phoneNonce,
                },
                "browser",
              );
              const ready = await secure.open(envelope);
              if (ready.type !== "secure-ready") throw new Error();
              if (
                stopped ||
                socket.current !== ws ||
                envelope.clientNonce !== clientNonce
              )
                return;
              channel.current = secure;
              clearTimeout(handshake);
              setOnline(true);
              setError("");
              void refresh();
              return;
            }
            if (!channel.current) return;
            const m = (await channel.current.open(
              envelope as SealedFrame,
            )) as Reply & { id?: string; deleted?: boolean };
            if (stopped || socket.current !== ws) return;
            if (m.type === "changed") {
              if (m.deleted && m.id) {
                loaded.current = loaded.current.filter((n) => n.id !== m.id);
                setNotes(loaded.current);
              }
              void refresh();
              return;
            }
            const p = m.requestId
              ? pending.current.get(m.requestId)
              : undefined;
            if (!p) return;
            if (m.kind === "item" && m.note) {
              p.items.push(m.note);
              return;
            }
            clearTimeout(p.timer);
            pending.current.delete(m.requestId!);
            if (m.error) p.reject(new Error(m.error));
            else p.resolve({ ...m, items: p.items });
          })
          .catch(() => {
            if (stopped || socket.current !== ws) return;
            channel.current = null;
            setOnline(false);
            setError("加密验证失败，已停止同步，请重新连接或配对");
            ws.close(4100, "Encryption failed");
          });
      };
      ws.onclose = (event) => {
        clearTimeout(handshake);
        if (socket.current !== ws) return;
        channel.current = null;
        setConnected(false);
        setOnline(false);
        for (const p of pending.current.values()) {
          clearTimeout(p.timer);
          p.reject(new Error("连接已断开，未确认保存的草稿已保留"));
        }
        pending.current.clear();
        if (stopped) return;
        if (event.code === 4001) {
          onExpired();
          return;
        }
        // A failed handshake has no close code; probe auth before reconnecting.
        void api("/session").catch((e) => {
          if (e instanceof APIError && e.status === 401) onExpired();
        });
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 15000);
      };
    };
    void keyPromise
      .then((key) => {
        if (!stopped) {
          if (key) connect();
          else onExpired();
        }
      })
      .catch(() => {
        if (!stopped) onExpired();
      });
    heartbeat = setInterval(() => {
      if (socket.current?.readyState === WebSocket.OPEN) {
        if (Date.now() - last > 30000) socket.current.close();
        else socket.current.send("ping");
      }
    }, 10000);
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      socket.current?.close();
      socket.current = null;
      channel.current = null;
      for (const p of pending.current.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("连接已关闭"));
      }
      pending.current.clear();
    };
  }, [onExpired, refresh, session]);
  return {
    notes,
    online,
    connected,
    error,
    loading,
    hasMore,
    request,
    refresh,
  };
}
