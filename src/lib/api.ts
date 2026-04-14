import { apiConfig, getApiOrigin, getAuthOrigin } from "../config/apiConfig";
import { getLocalStorageItem } from "./storage";
import type { ApiErrorBody } from "../types/api";

export class ApiRequestError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

type FetchJsonOptions = RequestInit & {
  /** If set, sends JSON body and Content-Type: application/json */
  json?: unknown;
  /** Use auth server origin (`NEXT_PUBLIC_AUTH_BASE_URL`) instead of API origin */
  useAuthOrigin?: boolean;
  /** Skip Authorization header (e.g. login) */
  skipAuth?: boolean;
};

function buildUrl(path: string, useAuthOrigin: boolean): string {
  const base = useAuthOrigin ? getAuthOrigin() : getApiOrigin();
  if (!base) {
    throw new Error(
      "Missing API base URL. Set NEXT_PUBLIC_API_BASE_URL in .env.local (see .env.example)."
    );
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Typed JSON fetch. Point `path` at your API (e.g. `/v1/me`, `/auth/login`).
 * Match response shape with your own types (see `src/types/api.ts`).
 */
export async function fetchJson<T>(path: string, options: FetchJsonOptions = {}): Promise<T> {
  const { json: body, useAuthOrigin, skipAuth, headers: initHeaders, ...rest } = options;
  const url = buildUrl(path, useAuthOrigin ?? false);

  const headers = new Headers(initHeaders);
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (!skipAuth && typeof window !== "undefined") {
    const token = getLocalStorageItem(apiConfig.accessTokenStorageKey);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const res = await fetch(url, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : rest.body
  });

  const data = await parseJsonSafe(res);

  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as ApiErrorBody).message ?? (data as ApiErrorBody).error ?? res.statusText)
        : res.statusText;
    throw new ApiRequestError(msg || `HTTP ${res.status}`, res.status, data);
  }

  return data as T;
}
