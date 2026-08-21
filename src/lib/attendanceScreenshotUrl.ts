/**
 * Desktop agent / legacy rows store screenshot media in different columns:
 * - `file_url` — preferred full URL (Azure or signed)
 * - `storage_path` — full Azure URL (current agent) OR blob object key
 * - `file_path` — legacy full URL or object key
 */

export type ScreenshotUrlRow = {
  id?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  file_url?: string | null;
  file_path?: string | null;
};

export type ScreenshotUrlSource = "file_url" | "storage_path" | "file_path" | null;

export function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function pickScreenshotUrlFields(row: ScreenshotUrlRow): {
  url: string | null;
  source: ScreenshotUrlSource;
  objectKey: string | null;
  bucket: string;
} {
  const bucket = String(row.storage_bucket || "attendance").trim() || "attendance";
  const fileUrl = String(row.file_url || "").trim();
  const storagePath = String(row.storage_path || "").trim();
  const filePath = String(row.file_path || "").trim();

  if (fileUrl) {
    return {
      url: fileUrl,
      source: "file_url",
      objectKey: storagePath && !isAbsoluteHttpUrl(storagePath) ? storagePath : null,
      bucket,
    };
  }

  if (storagePath && isAbsoluteHttpUrl(storagePath)) {
    return { url: storagePath, source: "storage_path", objectKey: null, bucket };
  }

  if (filePath && isAbsoluteHttpUrl(filePath)) {
    return { url: filePath, source: "file_path", objectKey: null, bucket };
  }

  const objectKey = storagePath || filePath || null;
  return {
    url: null,
    source: objectKey ? (storagePath ? "storage_path" : "file_path") : null,
    objectKey,
    bucket,
  };
}

/** True when the row has any media reference we can count / try to open. */
export function screenshotRowHasMedia(row: ScreenshotUrlRow): boolean {
  const fileUrl = String(row.file_url || "").trim();
  const storagePath = String(row.storage_path || "").trim();
  const filePath = String(row.file_path || "").trim();
  return Boolean(fileUrl || storagePath || filePath);
}

/**
 * Prefer media refs in this order (agent currently stores Azure URLs in
 * `storage_path`; older rows may use `file_url` / `file_path`).
 */
export function getScreenshotUrl(row: ScreenshotUrlRow): string | null {
  const fileUrl = String(row.file_url || "").trim();
  if (fileUrl) return fileUrl;
  const storagePath = String(row.storage_path || "").trim();
  if (storagePath) return storagePath;
  const filePath = String(row.file_path || "").trim();
  return filePath || null;
}

export function getScreenshotUrlSource(row: ScreenshotUrlRow): ScreenshotUrlSource {
  const fileUrl = String(row.file_url || "").trim();
  if (fileUrl) return "file_url";
  const storagePath = String(row.storage_path || "").trim();
  if (storagePath) return "storage_path";
  const filePath = String(row.file_path || "").trim();
  if (filePath) return "file_path";
  return null;
}

/**
 * Strip Content-Disposition=attachment style `download` query params so
 * browsers can paint the bytes in an <img>.
 */
export function inlineScreenshotUrl(u: string): string {
  try {
    const url = new URL(u);
    url.searchParams.delete("download");
    return url.toString();
  } catch {
    return u;
  }
}
