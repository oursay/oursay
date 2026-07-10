/**
 * Shared fetch client for live `/v1/*` calls through the Next.js same-origin proxy.
 * Mock mode is the default so tests and offline demo keep working without a running API.
 */

/** True when the app should use the mock corpus instead of live fetch (default: true). */
export function isMockOnly(): boolean {
  const flag = process.env.NEXT_PUBLIC_MOCK_ONLY;
  if (flag === "0" || flag === "false") return false;
  return true;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function apiErrorFromResponse(status: number, text: string): ApiError {
  if (text) {
    try {
      const parsed = JSON.parse(text) as { error?: { code?: string; message?: string; details?: unknown } };
      if (parsed.error?.message) {
        return new ApiError(status, parsed.error.message, parsed.error.code, parsed.error.details);
      }
    } catch {
      // plain-text body
    }
  }
  return new ApiError(status, text || resStatusLabel(status));
}

function resStatusLabel(status: number): string {
  return `Request failed (${status})`;
}

function apiBase(): string {
  if (typeof window !== "undefined") return "";
  return process.env.OURSAY_API_URL ?? "http://localhost:8080";
}

/** GET JSON from the API. Returns null on 404. Throws on other non-OK statuses. */
export async function apiGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${apiBase()}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw apiErrorFromResponse(res.status, body || res.statusText);
  }
  return (await res.json()) as T;
}

/** GET JSON without session cookies — anonymous public projection only. */
export async function publicApiGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${apiBase()}${path}`, {
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw apiErrorFromResponse(res.status, body || res.statusText);
  }
  return (await res.json()) as T;
}

/** POST JSON; returns null on 204. Throws on other non-OK statuses. */
export async function apiPost<T>(
  path: string,
  body?: unknown,
): Promise<T | null> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw apiErrorFromResponse(res.status, text || res.statusText);
  }
  if (res.status === 202) return (await res.json()) as T;
  return (await res.json()) as T;
}

/** PATCH JSON. Throws on non-OK. */
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw apiErrorFromResponse(res.status, text || res.statusText);
  }
  return (await res.json()) as T;
}

/** PUT JSON. Throws on non-OK. */
export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "PUT",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw apiErrorFromResponse(res.status, text || res.statusText);
  }
  return (await res.json()) as T;
}

/** Build a query string from scalar and array values (repeat keys for arrays). */
export function buildQuery(
  params: Record<string, string | number | string[] | undefined | null>,
): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(params)) {
    if (raw == null) continue;
    if (Array.isArray(raw)) {
      for (const v of raw) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(raw))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}
