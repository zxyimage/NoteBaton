import { t, getLanguage } from "./i18n";
import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  FileText,
  Link2,
  LogOut,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import QRCode from "qrcode";
import { api, type Note, type Session } from "./api";
import { useRelay } from "./hooks/useRelay";
import { renderMarkdown } from "../shared/markdown";
import { pairingLink } from "../shared/pairing";
import { importPairKey, randomHex } from "../shared/e2ee";
import { loadPairKey, savePairKey, removePairKey } from "./pairKeys";
import "../shared/markdown.css";

function Markdown({ text }: { text: string }) {
  const deferred = useDeferredValue(text);
  const html = useMemo(() => renderMarkdown(deferred), [deferred]);
  return (
    <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
function Pairing({ onPaired, notice }: { onPaired: (session: Session) => void; notice?: ReactNode }) {
  const [pair, setPair] = useState<{
    code: string;
    secret: string;
    expiresAt: number;
    encryptionKey: string;
  } | null>(null);
  const [qr, setQR] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function create() {
    setBusy(true);
    setError("");
    setPair(null);
    setQR("");
    setCopied(false);
    try {
      const result = await api<NonNullable<typeof pair>>("/pair", {
        method: "POST",
        body: JSON.stringify({ e2eeVersion: 1 }),
      });
      const encryptionKey = randomHex();
      setPair({ ...result, encryptionKey });
      setQR(
        await QRCode.toDataURL(
          pairingLink(window.location.origin, result.code, encryptionKey),
          {
            width: 240,
            margin: 1,
            color: { dark: "#213356", light: "#ffffff" },
          },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!pair) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<{ approved: boolean }>("/pair/status", {
          method: "POST",
          body: JSON.stringify({ code: pair.code, secret: pair.secret }),
        });
        if (stopped) return;
        if (result.approved) {
          const session = await api<Session>("/session");
          await savePairKey(session, await importPairKey(pair.encryptionKey));
          if (!stopped) onPaired(session);
          return;
        }
        timer = setTimeout(() => void poll(), 1500);
      } catch (e) {
        if (!stopped) {
          setError((e as Error).message);
          setPair(null);
        }
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pair, onPaired]);
  return (
    <div className="pair-page">
      <main className="pair-layout">
        <section className="pair-story">
          <span className="eyebrow">{t("配对你的设备")}</span>
          <h1>
            {t("把设备里的笔记，")}
            <br />
            {t("接到这里。")}
          </h1>
          <p>
            {t(
              "用 iPhone 扫码，或在 Mac 粘贴配对链接。保持已配对的 App 在线，就能在这里阅读和编辑笔记。",
            )}
          </p>
          <div className="pair-steps">
            <div>
              <span>01</span>
              {t("在 iPhone 或 Mac 打开「接力」")}
            </div>
            <div>
              <span>02</span>
              {t("点击「配对与同步」，扫码或粘贴完整配对链接")}
            </div>
            <div>
              <span>03</span>
              {t("保持设备在线，最近笔记即刻同步")}
            </div>
          </div>
        </section>
        <section className="pair-card">
          <Smartphone size={28} />
          <h2>{t("连接你的设备")}</h2>
          <p className="muted">{t("确认 App 显示的是此服务网址")}</p>
          <p className="service-origin">{window.location.origin}</p>
          {pair && qr ? (
            <>
              <img
                className="pair-qr"
                src={qr}
                alt={t("在接力 App 扫描此二维码配对")}
              />
              <code className="pair-code">
                {pair.code}.{pair.encryptionKey}
              </code>
              <button
                className="secondary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(
                      pairingLink(
                        window.location.origin,
                        pair.code,
                        pair.encryptionKey,
                      ),
                    )
                    .then(() => setCopied(true))
                    .catch(() =>
                      setError(
                        t(
                          "复制失败，请扫码，或在 App 填写上方网址和完整配对字符串",
                        ),
                      ),
                    )
                }
              >
                <Copy size={16} />
                {copied ? t("链接已复制") : t("复制完整配对链接")}
              </button>
              <p className="muted">
                {t("等待设备确认 · 5 分钟内有效")}
                <br />
                {t(
                  "配对字符串包含加密密钥，请勿分享。手动输入时，同时填写上方服务网址。",
                )}
              </p>
            </>
          ) : (
            <button
              className="primary full"
              disabled={busy}
              onClick={() => void create()}
            >
              {busy ? t("正在生成…") : t("显示配对码与二维码")}
            </button>
          )}
          {error && (
            <p role="alert" className="error">
              {t(error)}
            </p>
          )}
          <p className="privacy-note">
            {t("端到端加密 · 中转 API 无法解密笔记。")}
            <br />
            {t("已配对设备离线时，可继续阅读本页已同步内容。")}
          </p>
          {notice}
        </section>
      </main>
    </div>
  );
}
function Editor({
  note,
  online,
  request,
  onClose,
  onSaved,
}: {
  note: Note;
  online: boolean;
  request: ReturnType<typeof useRelay>["request"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(note.text);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [status, setStatus] = useState(
    note.revision ? t("已保存到设备") : t("输入后自动保存到设备"),
  );
  const [error, setError] = useState("");
  const latest = useRef(value);
  const ack = useRef(note.text);
  const revision = useRef(note.revision);
  const working = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  const alive = useRef(true);
  latest.current = value;
  const count = Array.from(value).length;
  const dirty = value !== ack.current;
  const save = async () => {
    const text = latest.current;
    if (text === ack.current) return true;
    if (working.current) return false;
    if (!online) {
      setStatus(t("草稿保留在本页"));
      setError(t("请打开已配对设备的 App 后同步"));
      return false;
    }
    if (Array.from(text).length > 100000) {
      setError(t("最多支持 100,000 个字符，内容已保留，请缩短后保存"));
      return false;
    }
    if (!text.trim() && !revision.current) {
      ack.current = text;
      return true;
    }
    working.current = true;
    setStatus(t("正在保存到设备…"));
    setError("");
    try {
      const reply = await request("save", {
        id: note.id,
        text,
        baseRevision: revision.current,
      });
      if (!reply.note) throw new Error(t("设备未确认保存"));
      ack.current = text;
      revision.current = reply.note.revision;
      if (alive.current) setStatus(t("已保存到设备"));
      onSaved();
      return true;
    } catch (e) {
      if (alive.current) {
        setStatus(t("尚未同步"));
        setError((e as Error).message);
      }
      return false;
    } finally {
      working.current = false;
      if (alive.current && latest.current !== text) {
        timer.current = setTimeout(() => void saveRef.current(), 400);
      }
    }
  };
  saveRef.current = save;
  useEffect(() => {
    if (value === ack.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRef.current(), 450);
    return () => clearTimeout(timer.current);
  }, [value, online]);
  useEffect(
    () => () => {
      alive.current = false;
      clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  async function finish() {
    if ((await save()) && latest.current === ack.current) onClose();
  }
  return (
    <section className="editor-panel">
      <header className="editor-header">
        <button className="text-button" onClick={() => void finish()}>
          <ArrowLeft size={18} />
          {t("返回")}
        </button>
        <strong>{note.revision ? t("编辑笔记") : t("新建笔记")}</strong>
        <button
          className="primary compact"
          disabled={working.current || count > 100000}
          onClick={() => void finish()}
        >
          {t("保存")}
        </button>
      </header>
      <div className="editor-tools">
        <div className="segmented">
          <button
            aria-pressed={mode === "edit"}
            onClick={() => setMode("edit")}
          >
            {t("编辑")}
          </button>
          <button
            aria-pressed={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            {t("预览")}
          </button>
        </div>
        <span className="muted">
          {count.toLocaleString(getLanguage())} / 100,000
        </span>
      </div>
      {mode === "edit" ? (
        <textarea
          className="note-editor"
          aria-label={t("笔记内容")}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
            setStatus(t("正在自动保存…"));
          }}
          placeholder={t("支持 Markdown\n\n# 一个想法\n随手写下，自动保存。")}
          autoFocus
        />
      ) : (
        <div className="editor-preview">
          <Markdown text={value || t("开始输入，预览会显示在这里。")} />
        </div>
      )}
      <footer className="editor-footer">
        <span>
          <Check size={14} />
          {t(status)}
        </span>
        {error && (
          <p className="error" role="alert">
            {t(error)}
          </p>
        )}
      </footer>
    </section>
  );
}
function Workspace({
  session,
  onExpired,
}: {
  session: Session;
  onExpired: () => void;
}) {
  const sync = useRelay(session, onExpired);
  const [editing, setEditing] = useState<Note | null>(null);
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sync.online || !sync.hasMore || sync.loading || editing) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void sync.refresh(true);
      },
      { rootMargin: "100px" },
    );
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [sync.online, sync.hasMore, sync.loading, sync.refresh, editing]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  const newNote = () =>
    setEditing({
      id: crypto.randomUUID(),
      text: "",
      revision: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  async function remove(id: string) {
    try {
      await sync.request("delete", {
        id,
        baseRevision: sync.notes.find((n) => n.id === id)?.revision,
      });
      setDeleting(null);
      void sync.refresh();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function logout() {
    try {
      await api("/logout", { method: "POST", body: "{}" });
      await removePairKey(session);
      onExpired();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  return (
    <>
      <header className="app-header">
        <div>
          <strong className="workspace-label">Note</strong>
          <div className="service-origin compact">{window.location.host}</div>
        </div>
        <div className="header-actions">
          <span className={`connection ${sync.online ? "live" : ""}`}>
            <i />
            {sync.online
              ? t("端到端加密已连接")
              : sync.connected
                ? t("等待已配对设备上线")
                : t("正在连接")}
          </span>
          <button
            className="icon-button"
            title={t("退出配对")}
            aria-label={t("退出配对")}
            disabled={!!editing}
            onClick={() => void logout()}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <main className="workspace">
        {editing ? (
          <Editor
            key={editing.id}
            note={editing}
            online={sync.online}
            request={sync.request}
            onClose={() => setEditing(null)}
            onSaved={() => void sync.refresh()}
          />
        ) : (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">{t("YOUR PERSONAL SPACE")}</span>
                <h1>{t("我的笔记")}</h1>
                <p className="muted">{t("最近修改的笔记，接着用。")}</p>
              </div>
              <button
                className="primary"
                disabled={!sync.online}
                onClick={newNote}
              >
                <Plus size={19} />
                {t("新建笔记")}
              </button>
            </div>
            {!sync.online && (
              <div className="offline-banner">
                <Smartphone size={19} />
                <div>
                  <strong>{t("在已配对设备打开「接力」以同步")}</strong>
                  <p>
                    {t(
                      "已显示的内容仍可阅读。更新、编辑和加载更多需要已配对的 iPhone App 在前台，或 Mac App 保持运行。",
                    )}
                  </p>
                </div>
              </div>
            )}
            {sync.error && (
              <p role="alert" className="error">
                {t(sync.error)}
              </p>
            )}
            <div className="section-heading">
              <h2>
                {t("最近修改")}
                <span>{sync.notes.length}</span>
              </h2>
              <button
                className="text-button"
                disabled={!sync.online || sync.loading}
                onClick={() => void sync.refresh()}
              >
                <RefreshCw size={15} />
                {t("刷新")}
              </button>
            </div>
            {!sync.notes.length ? (
              <div className="empty-state">
                <FileText size={36} />
                <h2>
                  {sync.loading ? t("正在从设备读取…") : t("从第一条笔记开始")}
                </h2>
                <p>{t("在已配对设备复制、输入或粘贴，内容会出现在这里。")}</p>
              </div>
            ) : (
              <div className="note-grid">
                {sync.notes.map((note) => (
                  <article className="note-card" key={note.id}>
                    <div
                      className="note-card-body"
                      role="button"
                      tabIndex={0}
                      aria-label={t("查看或编辑笔记")}
                      onClick={(e) => {
                        if (!(e.target as HTMLElement).closest("a"))
                          setEditing(note);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setEditing(note);
                      }}
                    >
                      <Markdown
                        text={Array.from(note.text).slice(0, 1800).join("")}
                      />
                      {Array.from(note.text).length > 1800 && (
                        <span className="muted">{t("查看全文 →")}</span>
                      )}
                    </div>
                    <footer>
                      <time>
                        {new Date(note.updatedAt).toLocaleString(
                          getLanguage(),
                          {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </time>
                      <div>
                        {deleting === note.id ? (
                          <>
                            <button
                              className="danger-button"
                              onClick={() => void remove(note.id)}
                            >
                              {t("确认删除")}
                            </button>
                            <button
                              className="text-button"
                              onClick={() => setDeleting(null)}
                            >
                              {t("取消")}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="icon-button"
                              aria-label={t("复制笔记")}
                              onClick={() =>
                                void navigator.clipboard
                                  .writeText(note.text)
                                  .then(() => setNotice(t("已复制")))
                                  .catch(() =>
                                    setNotice(
                                      t("复制失败，请打开笔记后手动选择复制"),
                                    ),
                                  )
                              }
                            >
                              <Copy size={17} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={t("删除笔记")}
                              disabled={!sync.online}
                              onClick={() => setDeleting(note.id)}
                            >
                              <Trash2 size={17} />
                            </button>
                          </>
                        )}
                      </div>
                    </footer>
                  </article>
                ))}
              </div>
            )}
            <div ref={sentinel} className="load-more">
              {sync.hasMore && (
                <button
                  className="secondary"
                  disabled={!sync.online || sync.loading}
                  onClick={() => void sync.refresh(true)}
                >
                  {sync.loading
                    ? t("正在从设备读取…")
                    : t("加载更早的 10 条笔记")}
                </button>
              )}
            </div>
            <p className="page-footer">
              <Link2 size={14} />
              {t("端到端加密 · 笔记保存在设备")}
            </p>
          </>
        )}
      </main>
      {notice && (
        <div className="toast" role="status">
          {t(notice)}
        </div>
      )}
    </>
  );
}
export default function NoteApp({ pairingNotice }: { pairingNotice?: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void api<Session>("/session")
      .then(async (value) => {
        if (value.e2eeVersion === 1 && (await loadPairKey(value)))
          setSession(value);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  const expired = useCallback(() => {
    if (session) void removePairKey(session).catch(() => {});
    setSession(null);
  }, [session]);
  const paired = useCallback((value: Session) => setSession(value), []);
  if (!ready) return <div className="app-loading">{t("正在连接…")}</div>;
  return session ? (
    <Workspace key={session.peerId} session={session} onExpired={expired} />
  ) : (
    <Pairing onPaired={paired} notice={pairingNotice} />
  );
}
