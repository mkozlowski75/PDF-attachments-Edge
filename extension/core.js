import { t, currentLocale } from "./i18n.js";

export const MAX_PDF_BYTES = 100 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export function withoutFragment(url) {
  try { const value = new URL(url); value.hash = ""; return value.href; }
  catch { return ""; }
}

export function isSupportedUrl(url) {
  try { return ["file:", "http:", "https:"].includes(new URL(url).protocol); }
  catch { return false; }
}

export function looksLikePdfUrl(url) {
  try { return /\.pdf$/i.test(decodeURIComponent(new URL(url).pathname)); }
  catch { return false; }
}

export function documentName(url) {
  try { return decodeURIComponent(new URL(url).pathname.split("/").pop()) || t("pdfDocument"); }
  catch { return t("pdfDocument"); }
}

export function hasPdfHeader(bytes) {
  const first = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return first.includes("%PDF-");
}

export function safeFilename(name) {
  // PDF-Dateinamen dürfen keine Pfade, Geräte-Namen oder NTFS-Datenströme erzeugen.
  let value = String(name || t("attachment")).replaceAll("\\", "/").split("/").pop();
  value = value.replace(/[<>:"/\\|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "_")
    .replace(/[. ]+$/g, "").replace(/^\.+/, "_");
  if (!value) value = t("attachment");
  if (/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value)) value = `_${value}`;
  if (value.length > 180) {
    const dot = value.lastIndexOf(".");
    const extension = dot > 0 && value.length - dot <= 20 ? value.slice(dot) : "";
    value = value.slice(0, 180 - extension.length) + extension;
  }
  return value;
}

export function formatBytes(value) {
  const format = number => new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 1 }).format(number);
  if (value < 1024) return t("bytes", format(value));
  if (value < 1024 * 1024) return t("kilobytes", format(value / 1024));
  return t("megabytes", format(value / (1024 * 1024)));
}

export async function readWebPdf(url, signal, fetcher = fetch) {
  const response = await fetcher(url, { credentials: "include", signal });
  if (!response.ok) throw new Error(t("errorHttp", response.status));
  if (Number(response.headers.get("content-length")) > MAX_PDF_BYTES) {
    throw new Error(t("errorTooLargeChoose"));
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_PDF_BYTES) throw new Error(t("errorTooLarge"));
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (!hasPdfHeader(bytes)) {
    throw new Error(t("errorWebNotPdf"));
  }
  return bytes;
}

export function readLocalPdf(url, signal) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    signal.addEventListener("abort", abort, { once: true });
    const finish = callback => { signal.removeEventListener("abort", abort); callback(); };
    request.open("GET", url);
    request.responseType = "arraybuffer";
    request.timeout = 30000;
    request.onprogress = event => {
      if (event.loaded > MAX_PDF_BYTES || (event.lengthComputable && event.total > MAX_PDF_BYTES)) {
        finish(() => reject(new Error(t("errorTooLarge"))));
        request.abort();
      }
    };
    request.onload = () => finish(() => {
      const bytes = new Uint8Array(request.response || new ArrayBuffer(0));
      if (bytes.length > MAX_PDF_BYTES) return reject(new Error(t("errorTooLarge")));
      if (!hasPdfHeader(bytes)) return reject(new Error(t("errorLocalNotPdf")));
      resolve(bytes);
    });
    request.onerror = () => finish(() => reject(new Error(t("errorLocalRead"))));
    request.ontimeout = () => finish(() => reject(new Error(t("errorReadTimeout"))));
    request.onabort = () => finish(() => reject(new DOMException(t("aborted"), "AbortError")));
    if (signal.aborted) { finish(() => reject(new DOMException(t("aborted"), "AbortError"))); return; }
    request.send();
  });
}
