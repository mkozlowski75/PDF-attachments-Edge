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
  if (!isNetworkFileUrl(url)) throw new Error("Der Windows-Helfer ist nur für PDF-Adressen auf Netzwerkfreigaben vorgesehen.");
  if (signal.aborted) throw new DOMException("Abgebrochen", "AbortError");
  if (!(await api.permissions.contains({ permissions: ["nativeMessaging"] }))) {
    throw new Error("Bitte den Windows-Helfer einmalig installieren und anschließend „Netzwerkzugriff aktivieren“ wählen. Danach werden Netzwerk-PDFs automatisch untersucht.");
  }
  if (signal.aborted) throw new DOMException("Abgebrochen", "AbortError");
  if (typeof api.runtime.connectNative !== "function") {
    throw new Error("Der Netzwerkzugriff ist freigegeben, aber die Seitenleiste muss neu gestartet werden. Bitte „Netzwerkzugriff aktivieren“ anklicken. Die Seitenleiste wird dabei automatisch neu geladen.");
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
    const abort = () => finish(new DOMException("Abgebrochen", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => finish(new Error("Der Zugriff auf die Netzwerk-PDF hat zu lange gedauert. Bitte die Verbindung zur Freigabe prüfen.")), timeoutMs);
    try {
      port = api.runtime.connectNative(NETWORK_HOST);
      port.onMessage.addListener(message => {
        if (settled) return;
        try {
          if (!message || typeof message !== "object") throw new Error("Ungültige Antwort des Windows-Helfers.");
          if (message.type === "error") throw new Error(typeof message.message === "string" ? message.message.slice(0, 600) : "Die Netzwerk-PDF konnte nicht gelesen werden.");
          if (message.type === "begin") {
            if (data || !Number.isSafeInteger(message.size) || message.size < 1 || message.size > MAX_PDF_BYTES) {
              throw new Error("Der Windows-Helfer meldet eine ungültige oder zu große PDF-Datei.");
            }
            data = new Uint8Array(message.size);
          } else if (message.type === "chunk") {
            if (!data || message.sequence !== sequence || typeof message.data !== "string" ||
                message.data.length > Math.ceil(NETWORK_CHUNK_BYTES / 3) * 4 ||
                !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(message.data)) {
              throw new Error("Die Netzwerk-PDF wurde nicht vollständig oder in falscher Reihenfolge übertragen.");
            }
            const decoded = atob(message.data);
            if (!decoded.length || decoded.length > NETWORK_CHUNK_BYTES || offset + decoded.length > data.length) {
              throw new Error("Ungültige Länge eines PDF-Datenblocks.");
            }
            for (let i = 0; i < decoded.length; i++) data[offset + i] = decoded.charCodeAt(i);
            offset += decoded.length;
            sequence++;
          } else if (message.type === "end") {
            if (!data || offset !== data.length || message.bytes !== offset || message.chunks !== sequence) {
              throw new Error("Die Netzwerk-PDF wurde nicht vollständig übertragen.");
            }
            if (!hasPdfHeader(data)) throw new Error("Die Netzwerkdatei enthält keinen lesbaren PDF-Dateikopf.");
            finish(null, data);
          } else if (message.type !== "begin") throw new Error("Unbekannte Antwort des Windows-Helfers.");
        } catch (error) { finish(error); }
      });
      port.onDisconnect.addListener(() => {
        const detail = api.runtime.lastError?.message || "";
        if (!settled) finish(new Error(`Der Windows-Helfer für Netzwerk-PDFs ist nicht erreichbar. Bitte den Helfer einmalig einrichten oder die Installation für diese Erweiterungs-ID prüfen.${detail ? ` (${detail.slice(0, 200)})` : ""}`));
      });
      port.postMessage({ command: "readPdf", url });
    } catch (error) { finish(error); }
  });
}
