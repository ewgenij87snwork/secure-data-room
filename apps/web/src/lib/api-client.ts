import { webEnv } from './env.js';
import { mapApiError } from './api-error.js';

export type SessionExpiredHandler = () => void | Promise<void>;

let sessionExpiredHandler: SessionExpiredHandler | undefined;
let sessionExpiredNotified = false;
let authSessionEpoch: string | undefined;

export function setSessionExpiredHandler(handler: SessionExpiredHandler | undefined): void {
  sessionExpiredHandler = handler;
  if (!handler) sessionExpiredNotified = false;
}

export function setAuthSessionEpoch(epoch: string | undefined): void {
  if (epoch !== undefined && epoch !== authSessionEpoch) sessionExpiredNotified = false;
  authSessionEpoch = epoch;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { accessToken?: string; shareToken?: string } = {},
): Promise<T> {
  const { accessToken, shareToken, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  headers.delete('Authorization');
  headers.delete('X-Share-Token');
  headers.set('Accept', 'application/json');
  const requestId = crypto.randomUUID();
  headers.set('X-Request-Id', requestId);
  if (requestInit.body && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (shareToken) headers.set('X-Share-Token', shareToken);

  const response = await fetch(new URL(path.replace(/^\/+/, ''), webEnv.VITE_API_BASE_URL), {
    ...requestInit,
    headers,
  });
  if (response.status === 401 && accessToken && !sessionExpiredNotified) {
    sessionExpiredNotified = true;
    await sessionExpiredHandler?.();
  }
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw mapApiError(response, body, requestId);
  return body as T;
}

export const api = { request: apiRequest };
