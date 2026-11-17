import { readFile, writeFile, mkdir, mkdtemp, cp, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(path.join(root, "../network-edge-test-"));
const extension = path.join(temp, "extension");
await cp(path.join(root, "extension"), extension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(extension, "manifest.json"), "utf8"));
// Ausschließlich das isolierte Testprofil erhält die optionale Berechtigung vorab.
// Das ausgelieferte Manifest bleibt optional; der Nutzer aktiviert sie per Klick.
manifest.permissions.push("nativeMessaging");
delete manifest.optional_permissions;
await writeFile(path.join(extension, "manifest.json"), JSON.stringify(manifest));
const id = createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest("hex").slice(0, 32)
  .split("").map(hex => String.fromCharCode(97 + parseInt(hex, 16))).join("");
const native = path.join(temp, "native");
await mkdir(native);
await cp(path.join(root, "native/bin/PdfNetworkHost.exe"), path.join(native, "PdfNetworkHost.exe"));
await cp(path.join(root, "native/bin/PdfNetworkHost.exe.config"), path.join(native, "PdfNetworkHost.exe.config"));
const hostManifestPath = path.join(native, "de.pdfanhaenge.network_reader.json");
await writeFile(hostManifestPath, JSON.stringify({ name: "de.pdfanhaenge.network_reader", description: "Isolierter Lesetest", path: path.join(native, "PdfNetworkHost.exe"), type: "stdio", allowed_origins: [`chrome-extension://${id}/`] }));
const registry = "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\de.pdfanhaenge.network_reader";
let previous = null;
try {
  const output = execFileSync("reg.exe", ["query", registry, "/ve"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  previous = output.match(/REG_SZ\s+(.+)/)?.[1]?.trim() || null;
  if (!previous) throw new Error("Vorhandene Host-Registrierung kann nicht sicher gesichert werden.");
} catch (error) { if (error.status !== 1) throw error; }
await writeFile(path.join(temp, "registry-backup.json"), JSON.stringify({ registry, previous, temporary: hostManifestPath }));
const profile = path.join(temp, "profile");
await mkdir(path.join(profile, "Default"), { recursive: true });
await writeFile(path.join(profile, "Default/Preferences"), JSON.stringify({ extensions: { ui: { developer_mode: true } } }));
let socket, processHandle, sequence = 0;
const pending = new Map();
async function call(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const number = ++sequence;
    const timer = setTimeout(() => { pending.delete(number); reject(new Error(`Zeitüberschreitung: ${method}`)); }, 15000);
    pending.set(number, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id: number, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function poll(action, label) {
  for (let i = 0; i < 150; i++) {
    try { const result = await action(); if (result) return result; }
    catch (error) { if (!error.message.includes("Cannot find default execution context")) throw error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Zeitüberschreitung: ${label}`);
}
const useInstalledHost = process.argv.includes("--installed");
const result = { isolatedProfile: true, optionalPermissionPregrantedOnlyForTest: true, usedInstalledHost: useInstalledHost, checks: [] };
try {
  if (useInstalledHost) assert.ok(previous, "Ein fertig installierter Helfer ist für diesen Test erforderlich.");
  else execFileSync("reg.exe", ["add", registry, "/ve", "/t", "REG_SZ", "/d", hostManifestPath, "/f"], { windowsHide: true, stdio: "ignore" });
  processHandle = spawn("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", [
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--enable-automation", "--edge-skip-compat-layer-relaunch", "--disable-component-extensions-with-background-pages",
    `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "about:blank"
  ], { windowsHide: true, stdio: "ignore" });
  const port = await poll(() => readFile(path.join(profile, "DevToolsActivePort"), "utf8").then(s => Number(s.split("\n")[0])).catch(() => null), "Edge starten");
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json());
  socket = new WebSocket(version.webSocketDebuggerUrl);
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  const helper = await call("Target.createTarget", { url: `chrome-extension://${id}/sidepanel.html` });
  const session = (await call("Target.attachToTarget", { targetId: helper.targetId, flatten: true })).sessionId;
  const evaluate = async expression => {
    const response = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, session);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  await poll(() => evaluate("document.documentElement?.dataset.ready === 'true'"), "Seitenleiste laden");
  const fileUrl = process.argv[2];
  assert.ok(fileUrl?.startsWith("file://"), "Netzwerk-PDF-Adresse als Argument angeben");
  const document = await call("Target.createTarget", { url: fileUrl });
  await call("Target.activateTarget", { targetId: document.targetId });
  await poll(() => evaluate("document.getElementById('count').textContent === '0' || document.getElementById('count').textContent === '?'"), "Automatische Netzwerk-Untersuchung");
  const state = await evaluate("({count:document.getElementById('count').textContent,status:document.getElementById('status').textContent,source:document.getElementById('source-note').textContent})");
  result.state = state;
  assert.equal(state.count, "0", JSON.stringify(state));
  assert.match(state.source, /Netzwerkfreigabe/);
  result.checks.push("Netzwerk-PDF aus dem aktiven Tab automatisch über Edge Native Messaging eingelesen");
  result.checks.push("PDF.js bestätigt keine Anhänge; kein Dateiauswahl-Aufruf erforderlich");
  const received = await evaluate(`import('./network.js').then(m => m.readNetworkPdf(${JSON.stringify(fileUrl)}, new AbortController().signal)).then(bytes => ({length:bytes.length,header:new TextDecoder().decode(bytes.subarray(0,8))}))`);
  assert.equal(received.length, (await stat(fileURLToPath(fileUrl))).size);
  assert.match(received.header, /%PDF-/);
  result.checks.push("Produktiver Host-/Erweiterungscode überträgt die vollständige PDF in begrenzten Datenblöcken");
  // Den beobachteten Zustand gezielt nachstellen; dies ersetzt keine echte erstmalige Dialogfreigabe.
  const missingApi = await evaluate("window.beforeNetworkReload=true; chrome.runtime.connectNative=undefined; typeof chrome.runtime.connectNative");
  assert.equal(missingApi, "undefined");
  await evaluate("document.getElementById('refresh').click()");
  await poll(() => evaluate("document.getElementById('status').textContent.includes('Netzwerkzugriff aktivieren')"), "Hinweis bei fehlender Schnittstelle");
  await call("Runtime.evaluate", { expression: "document.getElementById('network-enable').click()", userGesture: true }, session);
  await poll(() => evaluate("document.documentElement?.dataset.ready === 'true' && window.beforeNetworkReload === undefined"), "Seitenleiste nach Freigabe neu starten");
  await poll(() => evaluate("document.getElementById('count').textContent === '0'"), "Netzwerk-PDF nach Neustart automatisch untersuchen");
  assert.equal(await evaluate("typeof chrome.runtime.connectNative"), "function");
  result.checks.push("Fehlende Schnittstelle gezielt simuliert: Aktivierung startet die echte Edge-Seitenleiste neu, bindet die Schnittstelle und untersucht die Netzwerk-PDF automatisch erneut");
  result.optionalPermissionDialogTested = false;
  result.staleApiRecoveryTested = true;
  console.log(JSON.stringify(result, null, 2));
  await writeFile(path.join(root, "../network-edge-report.json"), JSON.stringify(result, null, 2));
} finally {
  if (socket?.readyState === WebSocket.OPEN) await call("Browser.close").catch(() => {});
  else processHandle?.kill();
  socket?.close();
  // Einen zeitgleich vom Nutzer anders gesetzten Registrierungseintrag nicht überschreiben.
  let current = null;
  try { current = execFileSync("reg.exe", ["query", registry, "/ve"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).match(/REG_SZ\s+(.+)/)?.[1]?.trim(); } catch { /* Der Eintrag kann bereits entfernt worden sein. */ }
  if (current === hostManifestPath) {
    if (previous) execFileSync("reg.exe", ["add", registry, "/ve", "/t", "REG_SZ", "/d", previous, "/f"], { windowsHide: true, stdio: "ignore" });
    else execFileSync("reg.exe", ["delete", registry, "/f"], { windowsHide: true, stdio: "ignore" });
  }
}
