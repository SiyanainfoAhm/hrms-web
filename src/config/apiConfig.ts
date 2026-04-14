/**
 * Wire your backend by setting env vars (see `.env.example`).
 * - `NEXT_PUBLIC_API_BASE_URL` — REST API root (e.g. https://api.example.com)
 * - `NEXT_PUBLIC_AUTH_BASE_URL` — optional; falls back to API base if unset
 */

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export const apiConfig = {
  apiBaseUrl: trimSlash(process.env.NEXT_PUBLIC_API_BASE_URL ?? ""),
  authBaseUrl: trimSlash(
    process.env.NEXT_PUBLIC_AUTH_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? ""
  ),
  /** After real login, store your JWT here; `fetchJson` will attach `Authorization`. */
  accessTokenStorageKey: "accessToken"
} as const;

export function getApiOrigin(): string {
  return apiConfig.apiBaseUrl;
}

export function getAuthOrigin(): string {
  return apiConfig.authBaseUrl || apiConfig.apiBaseUrl;
}
