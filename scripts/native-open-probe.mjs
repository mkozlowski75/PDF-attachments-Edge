import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Dieser Test benutzt nur das echte Edge-Downloadverhalten. Browser-Testframeworks
// ersetzen Download-Dateinamen und sind deshalb kein Nachweis für Windows-Zuordnungen.
const root = fileURLToPath(new URL("../", import.meta.url));
const profile = await mkdtemp(path.join(root, "../edge-native-run-"));
const downloads = path.join(root, "../native-downloads");
await mkdir(path.join(profile, "Default"), { recursive: true });
await mkdir(downloads, { recursive: true });
const preferenceFile = path.join(profile, "Default/Preferences");
const prefs = await readFile(preferenceFile, "utf8").then(JSON.parse).catch(() => ({}));
prefs.download = { ...prefs.download, default_directory: downloads, prompt_for_download: false };
prefs.extensions = { ...prefs.extensions, ui: { ...prefs.extensions?.ui, developer_mode: true } };
await writeFile(preferenceFile, JSON.stringify(prefs));
const portFile = path.join(profile, "DevToolsActivePort");
const previousPort = await readFile(portFile, "utf8").then(s => Number(s.split("\n")[0])).catch(() => null);
const previousAlive = previousPort && await fetch(`http://127.0.0.1:${previousPort}/json/version`).then(r => r.ok).catch(() => false);
if (!previousAlive) await unlink(portFile).catch(error => { if (error.code !== "ENOENT") throw error; });
const child = previousAlive ? null : spawn("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", [
  `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check",
  "--enable-automation", "--edge-skip-compat-layer-relaunch", "--disable-component-extensions-with-background-pages",
  `--disable-extensions-except=${path.join(root, "extension")}`,
  `--load-extension=${path.join(root, "extension")}`, "about:blank"
], { windowsHide: false, stdio: "ignore" });
let socket, seq = 0;
const pending = new Map();
async function call(method, params = {}, sessionId) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve: result => { clearTimeout(timeout); resolve(result); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function poll(callback, label) {
  for (let i = 0; i < 100; i++) {
    let result;
    try { result = await callback(); }
    catch (error) { if (!error.message.includes("Cannot find default execution context")) throw error; }
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout: ${label}`);
}
const report = { checks: [] };
try {
  const port = await poll(() => readFile(portFile, "utf8").then(s => Number(s.split("\n")[0])).catch(() => null), "Edge starten");
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json());
  socket = new WebSocket(version.webSocketDebuggerUrl);
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  // Ein bereits registrierter Service Worker darf beim Browserstart ruhen.
  const manifest = JSON.parse(await readFile(path.join(root, "extension/manifest.json"), "utf8"));
  const id = createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest("hex").slice(0, 32)
    .split("").map(hex => String.fromCharCode(97 + parseInt(hex, 16))).join("");
  const { targetId } = await call("Target.createTarget", { url: `chrome-extension://${id}/sidepanel.html` });
  let { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  const evaluate = async (expression, userGesture = false) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ": " + result.exceptionDetails.exception?.description);
    return result.result.value;
  };
  await poll(() => evaluate("document.documentElement.dataset.ready === 'true'"), "Oberfläche laden");
  const { root: dom } = await call("DOM.getDocument", {}, sessionId);
  const { nodeId } = await call("DOM.querySelector", { nodeId: dom.nodeId, selector: "#file" }, sessionId);
  await call("DOM.setFileInputFiles", { nodeId, files: [path.join(root, "tests/fixtures/mixed.pdf")] }, sessionId);
  await poll(() => evaluate("document.getElementById('count').textContent === '4'"), "Anhänge extrahieren");
  report.checks.push("Manuelle Dateiauswahl erkennt vier eingebettete Anhänge");
  const documentPath = path.join(profile, "native-pdf.pdf");
  const mixed = await readFile(path.join(root, "tests/fixtures/mixed.pdf"));
  await writeFile(documentPath, mixed);
  const docTarget = await call("Target.createTarget", { url: pathToFileURL(documentPath).href });
  const docSession = (await call("Target.attachToTarget", { targetId: docTarget.targetId, flatten: true })).sessionId;
  await evaluate("chrome.windows.getCurrent().then(w => chrome.sidePanel.open({windowId:w.id}))", true);
  const panelTarget = await poll(async () => (await call("Target.getTargets")).targetInfos.find(t =>
    t.targetId !== targetId && t.url === `chrome-extension://${id}/sidepanel.html`), "Echte Seitenleiste öffnen");
  sessionId = (await call("Target.attachToTarget", { targetId: panelTarget.targetId, flatten: true })).sessionId;
  await call("Target.activateTarget", { targetId: docTarget.targetId });
  await poll(() => evaluate("document.documentElement.dataset.ready === 'true' && document.getElementById('count').textContent === '4'"), "Anhänge in der echten Seitenleiste");
  const targets = (await call("Target.getTargets")).targetInfos;
  assert.ok(targets.some(t => t.url.includes("/edge_pdf/")), "Der eingebaute Edge-PDF-Viewer muss erhalten bleiben");
  report.checks.push("Echte Edge-Seitenleiste neben unverändertem eingebautem PDF-Viewer erkennt vier Anhänge");
  const screenshot = await call("Page.captureScreenshot", { format: "png" }, sessionId);
  await writeFile(path.join(root, "../real-sidebar-screenshot.png"), Buffer.from(screenshot.data, "base64"));
  await writeFile(documentPath, await readFile(path.join(root, "tests/fixtures/empty.pdf")));
  await call("Page.reload", {}, docSession);
  await poll(() => evaluate("document.getElementById('count').textContent === '0'"), "Neuladen ohne Anhänge");
  await writeFile(documentPath, mixed);
  await call("Page.reload", {}, docSession);
  await poll(() => evaluate("document.getElementById('count').textContent === '4'"), "Neuladen mit Anhängen");
  report.checks.push("Neuladen derselben lokalen PDF-Adresse aktualisiert die Anhangsliste von vier auf null und zurück");
  const other = await call("Target.createTarget", { url: "about:blank" });
  await call("Target.activateTarget", { targetId: other.targetId });
  await poll(() => evaluate("document.querySelectorAll('.attachment').length === 0"), "Tabwechsel entfernt alte Anhänge");
  await call("Target.activateTarget", { targetId: docTarget.targetId });
  await poll(() => evaluate("document.getElementById('count').textContent === '4'"), "PDF-Tab erneut aktivieren");
  report.checks.push("Tabwechsel entfernt alte Anhänge und liest beim Zurückwechseln die passende PDF ein");
  await evaluate("[...document.querySelectorAll('.attachment')].find(row => row.querySelector('h2').textContent === 'Hinweise.txt').querySelector('button').click()", true);
  await poll(() => evaluate("[...document.querySelectorAll('.attachment')].find(row => row.querySelector('h2').textContent === 'Hinweise.txt').querySelector('button').textContent === 'Öffnen'"), "Anhang speichern");
  const item = await evaluate("chrome.downloads.search({limit:1,orderBy:['-startTime']}).then(items => items[0])");
  assert.equal(path.basename(item.filename), "Hinweise.txt");
  assert.match(await readFile(item.filename, "utf8"), /Dieser Anhang wurde aus der PDF entnommen/);
  report.checks.push("Echtes Edge-Downloadverhalten: Hinweise.txt mit unverändertem Inhalt gespeichert");
  console.log("PREPARED", item.filename);
  await evaluate("[...document.querySelectorAll('.attachment')].find(row => row.querySelector('h2').textContent === 'Hinweise.txt').querySelector('button').click()", true);
  await new Promise(resolve => setTimeout(resolve, 3000));
  report.openedFile = item.filename;
  report.row = await evaluate("[...document.querySelectorAll('.attachment')].find(row => row.querySelector('h2').textContent === 'Hinweise.txt').innerText");
  report.checks.push("Öffnen mit echter Benutzeraktion an Edge übergeben");
  await writeFile(path.join(root, "../native-open-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (process.env.EDGE_HOLD_MS) {
    const until = Date.now() + Math.min(300000, Number(process.env.EDGE_HOLD_MS));
    while (Date.now() < until) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (process.env.EDGE_KEEP_OPEN !== "1") await call("Browser.close").catch(() => {});
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  if (socket?.readyState === WebSocket.OPEN && process.env.EDGE_KEEP_OPEN !== "1") await call("Browser.close").catch(() => {});
  else if (process.env.EDGE_KEEP_OPEN !== "1") child?.kill();
} finally {
  socket?.close();
  if (process.env.EDGE_KEEP_OPEN === "1") child?.unref();
}
