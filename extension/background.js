// Der originale PDF-Viewer und seine Einstellungen werden nicht verändert.
function configurePanel() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
}
configurePanel();
chrome.runtime.onInstalled.addListener(configurePanel);
chrome.runtime.onStartup.addListener(configurePanel);

// Die Antwort-Header erkennen auch PDF-Adressen ohne die Endung .pdf.
// Es werden keine PDF-Inhalte im Hintergrund geladen oder gespeichert.
chrome.webRequest.onHeadersReceived.addListener(async details => {
  if (details.tabId < 0) return;
  const header = details.responseHeaders?.find(h => h.name.toLowerCase() === "content-type");
  const isPdf = /^application\/(?:pdf|x-pdf)(?:\s*;|$)/i.test(header?.value || "");
  const key = `pdf:${details.tabId}`;
  if (isPdf) {
    await chrome.storage.session.set({ [key]: { url: details.url } });
  } else if (details.statusCode < 300 || details.statusCode >= 400) {
    await chrome.storage.session.remove(key);
  }
  chrome.runtime.sendMessage({ type: "document-response", tabId: details.tabId }).catch(() => {});
}, { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] }, ["responseHeaders"]);

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url || change.status === "loading") {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  }
});
chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(`pdf:${tabId}`);
});
