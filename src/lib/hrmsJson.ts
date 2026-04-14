/**
 * Same-origin HRMS API calls using the signed session cookie set by `/api/auth/login`.
 */
export class HrmsApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "HrmsApiError";
    this.status = status;
    this.body = body;
  }
}

export type HrmsFetchOptions = RequestInit & {
  json?: unknown;
};

export async function hrmsJson<T>(path: string, options: HrmsFetchOptions = {}): Promise<T> {
  const { json: body, headers: initHeaders, ...rest } = options;
  const headers = new Headers(initHeaders);
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, {
    ...rest,
    credentials: "include",
    headers,
    body: body !== undefined ? JSON.stringify(body) : rest.body
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error?: string }).error ?? res.statusText)
        : res.statusText;
    throw new HrmsApiError(msg || `HTTP ${res.status}`, res.status, data);
  }
  return data as T;
}
