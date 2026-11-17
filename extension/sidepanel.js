import * as pdfjs from "./vendor/pdf.mjs";
import { MAX_PDF_BYTES, MAX_ATTACHMENT_BYTES, withoutFragment, isSupportedUrl, looksLikePdfUrl,
  documentName, safeFilename, formatBytes, readWebPdf, readLocalPdf } from "./core.js";
import { isNetworkFileUrl, readNetworkPdf, enableNetworkAccess } from "./network.js";

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.mjs");
const $ = id => document.getElementById(id);
const elements = Object.fromEntries(["count", "document-name", "source-note", "status", "attachments", "empty",
  "refresh", "choose", "file", "password-form", "password", "password-cancel", "network-setup", "network-enable"].map(id => [id, $(id)]));
let windowId, activeTab = null, generation = 0, controller = null, loadingTask = null;
let attachments = [], source = null, passwordCallback = null;
const downloads = new Map();

function status(message, error = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", error);
}

function setBadge(value) {
  if (activeTab?.id == null) return;
  chrome.action.setBadgeText({ tabId: activeTab.id, text: value }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId: activeTab.id, color: "#126b60" }).catch(() => {});
}

function reset() {
  generation++;
  controller?.abort();
  controller = null;
  loadingTask?.destroy().catch(() => {});
  loadingTask = null;
  passwordCallback = null;
  elements["password-form"].hidden = true;
  elements.password.value = "";
  elements["network-setup"].hidden = true;
  attachments = [];
  source = null;
  elements.attachments.replaceChildren();
  elements.empty.hidden = true;
  elements.count.textContent = "–";
  elements["document-name"].textContent = "Keine PDF geladen";
  elements["source-note"].textContent = "Öffne eine PDF im bisherigen Edge-Viewer.";
  setBadge("");
  return generation;
}

function line(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function render() {
  elements.attachments.replaceChildren();
  for (const attachment of attachments) {
    const row = line("li", "attachment", "");
    row.append(line("h2", "filename", attachment.name));
    row.append(line("div", "muted", attachment.content ? formatBytes(attachment.content.length) : "Inhalt nicht lesbar"));
    if (attachment.description) row.append(line("p", "muted description", attachment.description));
    const actions = line("div", "toolbar", "");
    const button = line("button", "primary", attachment.downloadId == null ? "Bereitstellen" : "Öffnen");
    button.type = "button";
    button.disabled = attachment.busy || !attachment.content;
    if (attachment.busy) button.textContent = "Wird gespeichert …";
    // Direkt im Klick-Handler öffnen: Ein asynchroner Download verliert die Benutzeraktion.
    button.addEventListener("click", () => {
      if (attachment.downloadId != null) {
        chrome.downloads.open(attachment.downloadId, () => {
          const error = chrome.runtime.lastError;
          attachment.error = error ? `Edge konnte die Datei nicht öffnen: ${error.message} Bitte gegebenenfalls „Im Ordner anzeigen“ verwenden.` : "";
          if (attachments.includes(attachment)) render();
        });
      } else {
        prepareAttachment(attachment);
      }
    });
    actions.append(button);
    if (attachment.downloadId != null) {
      const folder = line("button", "", "Im Ordner anzeigen");
      folder.type = "button";
      folder.addEventListener("click", () => chrome.downloads.show(attachment.downloadId));
      actions.append(folder);
      const again = line("button", "", "Erneut bereitstellen");
      again.type = "button";
      again.addEventListener("click", () => { attachment.downloadId = null; prepareAttachment(attachment); });
      actions.append(again);
    }
    row.append(actions);
    if (attachment.savedName !== attachment.name) {
      row.append(line("div", "muted row-note", `Dateiname beim Speichern: ${attachment.savedName}`));
    }
    if (attachment.error) row.append(line("div", "row-error", attachment.error));
    elements.attachments.append(row);
  }
}

async function prepareAttachment(attachment) {
  if (attachment.busy || !attachment.content) return;
  attachment.busy = true;
  attachment.error = "";
  render();
  const blobUrl = URL.createObjectURL(new Blob([attachment.content], { type: "application/octet-stream" }));
  try {
    const id = await chrome.downloads.download({
      url: blobUrl,
      filename: `PDF-Anhaenge/${source.session}/${attachment.savedName}`,
      conflictAction: "uniquify",
      saveAs: false
    });
    downloads.set(id, { attachment, blobUrl });
    // Ein kleiner Download kann bereits vor Registrierung des Ereignisses fertig sein.
    const [item] = await chrome.downloads.search({ id });
    if (item?.state === "complete") finishDownload(id);
    else if (item?.state === "interrupted") finishDownload(id, "Der Download wurde abgebrochen oder von Edge blockiert.");
  } catch (error) {
    attachment.busy = false;
    attachment.error = `Der Anhang konnte nicht gespeichert werden: ${error.message}`;
    URL.revokeObjectURL(blobUrl);
  }
  if (attachments.includes(attachment)) render();
}

function finishDownload(id, error = "") {
  const entry = downloads.get(id);
  if (!entry) return;
  downloads.delete(id);
  URL.revokeObjectURL(entry.blobUrl);
  entry.attachment.busy = false;
  entry.attachment.error = error;
  if (!error) entry.attachment.downloadId = id;
  if (attachments.includes(entry.attachment)) render();
}

chrome.downloads.onChanged.addListener(change => {
  if (change.state?.current === "complete") finishDownload(change.id);
  if (change.state?.current === "interrupted") finishDownload(change.id, "Der Download wurde abgebrochen oder von Edge blockiert.");
});
chrome.downloads.onErased.addListener(id => {
  for (const attachment of attachments) {
    if (attachment.downloadId === id) attachment.downloadId = null;
  }
  render();
});

async function parsePdf(bytes, token) {
  if (token !== generation) return;
  status("Eingebettete Anhänge werden gesucht …");
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, enableXfa: false,
    useSystemFonts: false, stopAtErrors: true });
  loadingTask = task;
  task.onPassword = (callback, reason) => {
    if (token !== generation) return;
    passwordCallback = callback;
    elements["password-form"].hidden = false;
    status(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD ? "Das Passwort ist nicht richtig. Bitte erneut eingeben." : "Diese PDF ist passwortgeschützt.");
    elements.password.focus();
  };
  try {
    const pdf = await task.promise;
    const result = await pdf.getAttachments();
    if (token !== generation) return;
    let unreadable = 0;
    attachments = Object.values(result || {}).map((item, index) => {
      const name = item.rawFilename || item.filename || `Anhang ${index + 1}`;
      const content = item.content instanceof Uint8Array && item.content.length <= MAX_ATTACHMENT_BYTES ? item.content : null;
      if (!content) unreadable++;
      return { name, savedName: safeFilename(name), description: item.description || "", content,
        downloadId: null, busy: false, error: content ? "" : "Der eingebettete Inhalt fehlt oder konnte nicht vollständig gelesen werden." };
    });
    elements.count.textContent = String(attachments.length);
    elements.empty.hidden = attachments.length !== 0;
    status(unreadable ? `${attachments.length} Anhänge gefunden. ${unreadable} davon konnten nicht vollständig gelesen werden.` :
      attachments.length ? `${attachments.length} ${attachments.length === 1 ? "Anhang gefunden" : "Anhänge gefunden"}. Zum Öffnen zuerst bereitstellen.` : "Die PDF wurde geprüft.", unreadable > 0);
    setBadge(String(attachments.length));
    render();
  } finally {
    if (loadingTask === task) loadingTask = null;
    if (token === generation) {
      passwordCallback = null;
      elements["password-form"].hidden = true;
      elements.password.value = "";
    }
    await task.destroy();
  }
}

async function loadPdf({ url, file, tab }) {
  activeTab = tab || activeTab;
  const token = reset();
  source = { name: file?.name || documentName(url), url, session: crypto.randomUUID() };
  elements["document-name"].textContent = source.name;
  elements["source-note"].textContent = file ? "Manuell ausgewählte PDF · Zuordnung zu diesem Tab" :
    isNetworkFileUrl(url) ? `PDF auf Netzwerkfreigabe · ${new URL(url).hostname}` :
      new URL(url).protocol === "file:" ? "Lokale PDF aus dem aktuellen Tab" : new URL(url).origin;
  status("PDF wird gelesen …");
  controller = new AbortController();
  const currentController = controller;
  const timeout = setTimeout(() => currentController.abort(new Error("Zeitüberschreitung")), 30000);
  try {
    let bytes;
    if (file) {
      if (file.size > MAX_PDF_BYTES) throw new Error("Die PDF ist größer als 100 MB.");
      bytes = new Uint8Array(await file.arrayBuffer());
    } else if (new URL(url).protocol === "file:") {
      const allowed = await chrome.extension.isAllowedFileSchemeAccess();
      if (!allowed) throw new Error("Bitte unter edge://extensions den Zugriff auf Datei-URLs zulassen oder „PDF auswählen“ verwenden.");
      bytes = isNetworkFileUrl(url) ? await readNetworkPdf(url, currentController.signal) : await readLocalPdf(url, currentController.signal);
    } else {
      bytes = await readWebPdf(url, currentController.signal);
    }
    clearTimeout(timeout);
    await parsePdf(bytes, token);
  } catch (error) {
    if (token !== generation) return;
    elements.count.textContent = "?";
    elements.empty.hidden = true;
    setBadge("?");
    elements["network-setup"].hidden = !isNetworkFileUrl(url);
    const message = error.name === "AbortError" ? "Das Lesen wurde abgebrochen oder dauerte zu lange. Bitte erneut prüfen oder eine PDF auswählen." :
      error.message || "Die PDF konnte nicht vollständig untersucht werden.";
    status(`${message} Die Anzahl der Anhänge ist unbekannt.`, true);
  } finally {
    clearTimeout(timeout);
  }
}

async function selectActiveTab(force = false) {
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (!tab) { reset(); status("Kein aktiver Tab gefunden. Du kannst eine PDF auswählen."); return; }
  const previous = activeTab;
  activeTab = tab;
  if (!force && previous?.id === tab.id && withoutFragment(previous.url) === withoutFragment(tab.url) && source) return;
  const token = reset();
  const recorded = (await chrome.storage.session.get(`pdf:${tab.id}`))[`pdf:${tab.id}`];
  if (token !== generation) return;
  const url = withoutFragment(tab.url);
  if (isSupportedUrl(url) && (force || looksLikePdfUrl(url) || withoutFragment(recorded?.url) === url)) {
    await loadPdf({ url, tab });
  } else {
    status("Öffne eine PDF. Falls die Adresse keine PDF-Endung hat, klicke auf „Aktuellen Tab prüfen“. Alternativ kannst du eine PDF auswählen.");
  }
}

elements.refresh.addEventListener("click", () => selectActiveTab(true).catch(error => status(error.message, true)));
elements.choose.addEventListener("click", () => elements.file.click());
elements["network-enable"].addEventListener("click", () => {
  // Die optionale Windows-Anbindung wird nur durch diese ausdrückliche Aktion erlaubt.
  enableNetworkAccess().then(granted => {
    if (granted) return;
    status("Der Netzwerkzugriff wurde nicht aktiviert. Du kannst weiterhin eine PDF ausdrücklich auswählen.", true);
  }).catch(error => status(error.message, true));
});
elements.file.addEventListener("change", () => {
  const file = elements.file.files[0];
  elements.file.value = "";
  if (file) loadPdf({ file });
});
document.addEventListener("dragover", event => { event.preventDefault(); });
document.addEventListener("drop", event => {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file) loadPdf({ file });
});
elements["password-form"].addEventListener("submit", event => {
  event.preventDefault();
  if (!passwordCallback) return;
  const callback = passwordCallback;
  passwordCallback = null;
  const password = elements.password.value;
  elements.password.value = "";
  elements["password-form"].hidden = true;
  status("PDF wird entsperrt …");
  callback(password);
});
elements["password-cancel"].addEventListener("click", () => {
  reset();
  status("Passworteingabe abgebrochen. Die Anzahl der Anhänge ist unbekannt.");
  elements.count.textContent = "?";
  setBadge("?");
});
chrome.tabs.onActivated.addListener(info => {
  if (info.windowId === windowId) selectActiveTab().catch(error => status(error.message, true));
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (id !== activeTab?.id) return;
  // Auch unter derselben URL kann nach einem Neuladen ein anderes Dokument stehen.
  // Ein reiner Wechsel von #page=... verändert dagegen keine Dateiinhalte.
  if (change.status === "loading" || (change.url && withoutFragment(change.url) !== withoutFragment(activeTab.url))) {
    reset();
    status("Das Dokument wird neu geladen …");
  }
  if (change.url || change.status === "complete") {
    selectActiveTab().catch(error => status(error.message, true));
  }
});
chrome.runtime.onMessage.addListener(message => {
  if (message.type === "document-response" && message.tabId === activeTab?.id) {
    selectActiveTab().catch(error => status(error.message, true));
  }
});
const currentWindow = await chrome.windows.getCurrent();
windowId = currentWindow.id;
document.documentElement.dataset.ready = "true";
await selectActiveTab();
