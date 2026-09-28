export type Note = {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
};
export type Cursor = { updatedAt: number; id: string };
export type Session = {
  deviceId: string;
  peerId: string;
  expiresAt: number;
  e2eeVersion: 1;
};
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "same-origin",
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new APIError(response.status, body.error ?? "连接失败，请重试");
  return body;
}
