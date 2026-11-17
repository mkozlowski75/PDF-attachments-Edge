import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "dist");
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(root, "extension/manifest.json"), "utf8"));
const id = createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest("hex").slice(0, 32)
  .split("").map(hex => String.fromCharCode(97 + parseInt(hex, 16))).join("");
const report = [];
for (const [language, expected, heading, prepare] of [
  ["de", "de", "PDF-Anhänge", "Bereitstellen"], ["en", "en", "PDF Attachments", "Prepare"],
  ["pl", "pl", "Załączniki PDF", "Przygotuj"], ["fr", "de", "PDF-Anhänge", "Bereitstellen"]
]) {
  const profile = await mkdtemp(path.join(tmpdir(), "edge-pdf-locales-"));
  await mkdir(path.join(profile, "Default"));
  await writeFile(path.join(profile, "Default/Preferences"), JSON.stringify({ extensions: { ui: { developer_mode: true } } }));
  let socket, sequence = 0;
  const pending = new Map();
  async function poll(action, label) {
    for (let i = 0; i < 150; i++) {
      try { const value = await action(); if (value) return value; }
      catch (error) { if (!error.message.includes("Cannot find default execution context")) throw error; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timeout: ${label}`);
  }
  async function call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const number = ++sequence;
      const timeout = setTimeout(() => { pending.delete(number); reject(new Error(`Timeout: ${method}`)); }, 15000);
      pending.set(number, { resolve(value) { clearTimeout(timeout); resolve(value); }, reject(error) { clearTimeout(timeout); reject(error); } });
      socket.send(JSON.stringify({ id: number, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  const child = spawn("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", [
    `--user-data-dir=${profile}`, `--lang=${language}`, "--remote-debugging-port=0", "--headless=new",
    "--no-first-run", "--no-default-browser-check", "--enable-automation", "--edge-skip-compat-layer-relaunch",
    "--disable-component-extensions-with-background-pages", `--disable-extensions-except=${path.join(root, "extension")}`,
    `--load-extension=${path.join(root, "extension")}`, "about:blank"
  ], { windowsHide: true, stdio: "ignore" });
  try {
    const port = await poll(() => readFile(path.join(profile, "DevToolsActivePort"), "utf8").then(s => Number(s.split("\n")[0])).catch(() => null), "Edge starten");
    const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(response => response.json());
    socket = new WebSocket(version.webSocketDebuggerUrl);
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data), request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
    });
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    const helper = await call("Target.createTarget", { url: `chrome-extension://${id}/sidepanel.html` });
    const session = (await call("Target.attachToTarget", { targetId: helper.targetId, flatten: true })).sessionId;
    const evaluate = async expression => {
      const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, session);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await poll(() => evaluate("document.documentElement?.dataset.ready === 'true'"), "Seitenleiste laden");
    const pdf = await call("Target.createTarget", { url: pathToFileURL(path.join(root, "tests/fixtures/mixed.pdf")).href });
    await call("Target.activateTarget", { targetId: pdf.targetId });
    await poll(() => evaluate("document.getElementById('count').textContent === '4'"), "Vier Anhänge anzeigen");
    const state = await evaluate(`({language:chrome.i18n.getUILanguage(),locale:document.documentElement.lang,
      heading:document.querySelector('h1').textContent,count:document.getElementById('count').textContent,
      button:document.querySelector('.attachment button').textContent,status:document.getElementById('status').textContent,
      manifestName:chrome.runtime.getManifest().name,passwordLabel:document.querySelector('label[for=password]').textContent,
      countLabel:document.getElementById('count').getAttribute('aria-label')})`);
    assert.equal(state.locale, expected);
    assert.equal(state.heading, heading);
    assert.equal(state.button, prepare);
    assert.ok(!state.manifestName.includes("__MSG_"));
    assert.equal(await evaluate("document.querySelector('[data-i18n=helpSummary]').textContent === chrome.i18n.getMessage('helpSummary')"), true);
    const errors = await evaluate(`Promise.all([import('./core.js').then(m=>m.readWebPdf('https://example.test/',new AbortController().signal,async()=>new Response('<html></html>')).catch(e=>e.message)),
      import('./native-errors.js').then(m=>m.localizeNativeError('Die Netzwerk-PDF wurde nicht gefunden. Bitte die Freigabe und die Adresse prüfen.'))])`);
    assert.equal(errors[0], await evaluate("chrome.i18n.getMessage('errorWebNotPdf')"));
    assert.equal(errors[1], await evaluate("chrome.i18n.getMessage('errorNetworkNotFound')"));
    await call("Emulation.setDeviceMetricsOverride", { width: 380, height: 900, deviceScaleFactor: 1, mobile: false }, session);
    const screenshot = await call("Page.captureScreenshot", { format: "png" }, session);
    await writeFile(path.join(output, `sidebar-${language}.png`), Buffer.from(screenshot.data, "base64"));
    report.push({ ...state, localizedErrorsVerified: true });
    console.log(`${language} -> ${state.locale}: ${state.heading}; ${state.status}`);
  } finally {
    if (socket?.readyState === WebSocket.OPEN) await call("Browser.close").catch(() => child.kill()); else child.kill();
    socket?.close();
  }
}
await writeFile(path.join(output, "locales-edge-report.json"), JSON.stringify(report, null, 2));
