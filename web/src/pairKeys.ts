import type { Session } from "./api";

// IndexedDB can structured-clone non-extractable CryptoKeys. No note bodies here.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("relay-e2ee", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("keys");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("浏览器无法保存加密密钥，请允许此网站存储数据"));
  });
}
async function access<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("keys", mode),
        request = action(tx.objectStore("keys"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () =>
        reject(new Error("无法访问本地加密密钥，请重新配对"));
    });
  } finally {
    db.close();
  }
}
const id = (s: Session) => `${s.deviceId}.${s.peerId}`;
export async function savePairKey(
  session: Session,
  key: CryptoKey,
): Promise<void> {
  await access("readwrite", (store) =>
    store.put({ key, expiresAt: session.expiresAt }, id(session)),
  );
}
export async function loadPairKey(session: Session): Promise<CryptoKey | null> {
  const value = await access<{ key: CryptoKey; expiresAt: number } | undefined>(
    "readonly",
    (store) => store.get(id(session)),
  );
  if (
    !value ||
    value.expiresAt <= Date.now() ||
    !(value.key instanceof CryptoKey) ||
    value.key.extractable
  ) {
    await removePairKey(session);
    return null;
  }
  return value.key;
}
export async function removePairKey(session: Session): Promise<void> {
  await access("readwrite", (store) => store.delete(id(session)));
}
