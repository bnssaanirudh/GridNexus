/**
 * Shared HTTP client for GridNexus browser-to-service requests.
 *
 * All API calls pass through this module so authentication, timeouts, aborts,
 * status handling, and error messages behave consistently.
 */

const TOKEN_KEY = "gn_token";
const DEFAULT_TIMEOUT_MS = 10_000;

type RuntimeConfig = {
  brokerUrl?: string;
  engineUrl?: string;
};

declare global {
  interface Window {
    __GRIDNEXUS_CONFIG__?: RuntimeConfig;
  }
}

const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env;
const host = typeof window !== "undefined" && window.location?.hostname
  ? window.location.hostname
  : "127.0.0.1";
const runtimeConfig = typeof window !== "undefined" ? window.__GRIDNEXUS_CONFIG__ : undefined;

/** Empty production bases intentionally use same-origin reverse-proxy routes. */
export const BROKER_URL = String(
  runtimeConfig?.brokerUrl
    ?? env?.VITE_BROKER_URL
    ?? (env?.DEV ? `http://${host}:3000` : ""),
).replace(/\/$/, "");

export const ENGINE_URL = String(
  runtimeConfig?.engineUrl
    ?? env?.VITE_API_URL
    ?? env?.VITE_ENGINE_URL
    ?? (env?.DEV ? `http://${host}:8000` : "/engine"),
).replace(/\/$/, "");

export interface ApiRequestOptions extends Omit<RequestInit, "signal"> {
  auth?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class ApiError extends Error {
  readonly status: number | null;
  readonly body: unknown;
  readonly url: string;

  constructor(message: string, options: { status?: number | null; body?: unknown; url: string; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.status = options.status ?? null;
    this.body = options.body;
    this.url = options.url;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/$/, "")}${normalizedPath}`;
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["detail", "message", "error"]) {
      if (typeof record[key] === "string" && record[key]) return record[key];
    }
  }
  return `Request failed with HTTP ${status}`;
}

export async function requestJson<T>(
  baseUrl: string,
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const url = joinUrl(baseUrl, path);
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;

  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (options.auth !== false && !headers.has("Authorization") && typeof localStorage !== "undefined") {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    const response = await fetch(url, {
      ...options,
      auth: undefined,
      timeoutMs: undefined,
      headers,
      signal: controller.signal,
      credentials: options.credentials ?? "same-origin",
    } as RequestInit);

    if (response.status === 204) return undefined as T;

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    if (!response.ok) {
      throw new ApiError(errorMessage(body, response.status), {
        status: response.status,
        body,
        url,
      });
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) {
      throw new ApiError(`Request timed out after ${timeoutMs} ms`, { status: null, url, cause: error });
    }
    if (options.signal?.aborted) throw error;
    throw new ApiError("Network request failed", { status: null, url, cause: error });
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function apiGet<T>(baseUrl: string, path: string, options: ApiRequestOptions = {}): Promise<T> {
  return requestJson<T>(baseUrl, path, { ...options, method: "GET" });
}

export function apiPost<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return requestJson<T>(baseUrl, path, {
    ...options,
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

