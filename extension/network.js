import { t } from "./i18n.js";
import { localizeNativeError } from "./native-errors.js";
import { MAX_PDF_BYTES, hasPdfHeader } from "./core.js";

export const NETWORK_HOST = "de.pdfanhaenge.network_reader";
export const NETWORK_CHUNK_BYTES = 65536;

export async function enableNetworkAccess(api = chrome, reload = () => location.reload()) {
  const granted = await api.permissions.request({ permissions: ["nativeMessaging"] });
  // Edge bindet optionale Schnittstellen beim Start eines Seitenkontexts.
  // Nach der Freigabe deshalb die Seitenleiste neu starten, bevor sie den Helfer aufruft.
  if (granted) reload();
  return granted;
}

export function isNetworkFileUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "file:" && Boolean(url.hostname) && url.hostname.toLowerCase() !== "localhost";
  } catch { return false; }
}

export async function readNetworkPdf(url, signal, api = chrome, timeoutMs = 30000) {
  if (!isNetworkFileUrl(url)) throw new Error(t("errorNetworkOnly"));
  if (signal.aborted) throw new DOMException(t("aborted"), "AbortError");
  if (!(await api.permissions.contains({ permissions: ["nativeMessaging"] }))) {
    throw new Error(t("errorNetworkEnable"));
  }
  if (signal.aborted) throw new DOMException(t("aborted"), "AbortError");
  if (typeof api.runtime.connectNative !== "function") {
    throw new Error(t("errorNetworkRestart"));
  }
  return new Promise((resolve, reject) => {
    let port, timer, settled = false, data = null, offset = 0, sequence = 0;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      try { port?.disconnect(); } catch { /* Der Host kann bereits beendet sein. */ }
      data = null;
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(new DOMException(t("aborted"), "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => finish(new Error(t("errorNetworkTimeout"))), timeoutMs);
    try {
      port = api.runtime.connectNative(NETWORK_HOST);
      port.onMessage.addListener(message => {
        if (settled) return;
        try {
          if (!message || typeof message !== "object") throw new Error(t("errorHelperResponse"));
          if (message.type === "error") throw new Error(localizeNativeError(message.message));
          if (message.type === "begin") {
            if (data || !Number.isSafeInteger(message.size) || message.size < 1 || message.size > MAX_PDF_BYTES) {
              throw new Error(t("errorNetworkSize"));
            }
            data = new Uint8Array(message.size);
          } else if (message.type === "chunk") {
            if (!data || message.sequence !== sequence || typeof message.data !== "string" ||
                message.data.length > Math.ceil(NETWORK_CHUNK_BYTES / 3) * 4 ||
                !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(message.data)) {
              throw new Error(t("errorNetworkSequence"));
            }
            const decoded = atob(message.data);
            if (!decoded.length || decoded.length > NETWORK_CHUNK_BYTES || offset + decoded.length > data.length) {
              throw new Error(t("errorNetworkBlock"));
            }
            for (let i = 0; i < decoded.length; i++) data[offset + i] = decoded.charCodeAt(i);
            offset += decoded.length;
            sequence++;
          } else if (message.type === "end") {
            if (!data || offset !== data.length || message.bytes !== offset || message.chunks !== sequence) {
              throw new Error(t("errorNetworkIncomplete"));
            }
            if (!hasPdfHeader(data)) throw new Error(t("errorNetworkHeader"));
            finish(null, data);
          } else if (message.type !== "begin") throw new Error(t("errorHelperUnknown"));
        } catch (error) { finish(error); }
      });
      port.onDisconnect.addListener(() => {
        const detail = api.runtime.lastError?.message || "";
        if (!settled) finish(new Error(detail ? t("errorHelperUnavailableDetail", [t("errorHelperUnavailable"), detail.slice(0, 200)]) : t("errorHelperUnavailable")));
      });
      port.postMessage({ command: "readPdf", url });
    } catch (error) { finish(error); }
  });
}
