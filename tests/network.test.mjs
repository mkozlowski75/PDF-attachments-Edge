import "./helpers/i18n.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isNetworkFileUrl, readNetworkPdf, enableNetworkAccess } from "../extension/network.js";

function fakeApi(messages, permitted = true) {
  let receive, disconnected, closed = false;
  const port = {
    onMessage: { addListener: listener => { receive = listener; } },
    onDisconnect: { addListener: listener => { disconnected = listener; } },
    postMessage: request => { assert.equal(request.command, "readPdf"); queueMicrotask(() => messages?.forEach(message => receive(message))); },
    disconnect: () => { closed = true; disconnected?.(); }
  };
  return { api: { permissions: { contains: async () => permitted }, runtime: { connectNative: () => port } },
    isClosed: () => closed, disconnect: () => disconnected?.() };
}
const url = "file://server/Freigabe/Ordner/Datei.pdf";
test("Freigabe startet die Seitenleiste vor der ersten Helferverbindung neu", async () => {
  const events = [];
  const api = { permissions: { request: async permissions => {
    assert.deepEqual(permissions, { permissions: ["nativeMessaging"] });
    events.push("granted");
    return true;
  } } };
  assert.equal(await enableNetworkAccess(api, () => events.push("reload")), true);
  assert.deepEqual(events, ["granted", "reload"]);
});

test("Abgelehnte oder fehlgeschlagene Freigabe lädt die Seitenleiste nicht neu", async () => {
  const reload = () => assert.fail("Ohne Freigabe nicht neu laden");
  assert.equal(await enableNetworkAccess({ permissions: { request: async () => false } }, reload), false);
  await assert.rejects(enableNetworkAccess({ permissions: { request: async () => { throw new Error("abgebrochen"); } } }, reload), /abgebrochen/);
});

test("Freigegebene, noch nicht gebundene Schnittstelle liefert einen Hinweis zur Wiederherstellung", async () => {
  const fake = fakeApi(null);
  delete fake.api.runtime.connectNative;
  await assert.rejects(readNetworkPdf(url, new AbortController().signal, fake.api), /Netzwerkzugriff aktivieren/);
});

test("Nur Netzwerk-Dateiadressen aktivieren den UNC-Zweig", () => {
  assert.equal(isNetworkFileUrl(url), true);
  assert.equal(isNetworkFileUrl("file:///C:/Datei.pdf"), false);
  assert.equal(isNetworkFileUrl("https://server/Datei.pdf"), false);
  assert.equal(isNetworkFileUrl("file://localhost/C:/Datei.pdf"), false);
});
test("Netzwerk-PDF wird vollständig aus sequenzierten Blöcken zusammengesetzt", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\nPrüfung");
  const fake = fakeApi([{ type: "begin", size: bytes.length },
    { type: "chunk", sequence: 0, data: Buffer.from(bytes).toString("base64") },
    { type: "end", bytes: bytes.length, chunks: 1 }]);
  assert.deepEqual(await readNetworkPdf(url, new AbortController().signal, fake.api), bytes);
  assert.equal(fake.isClosed(), true);
});
test("Ohne ausdrückliche optionale Erlaubnis wird kein Host geöffnet", async () => {
  const fake = fakeApi([], false);
  fake.api.runtime.connectNative = () => assert.fail("Host darf ohne Freigabe nicht starten");
  await assert.rejects(readNetworkPdf(url, new AbortController().signal, fake.api), /Netzwerkzugriff aktivieren/);
});
test("Ungültige Größen, fehlende Blöcke, Reihenfolgen und Inhalte werden abgewiesen", async () => {
  const cases = [
    [{ type: "begin", size: 100 * 1024 * 1024 + 1 }],
    [{ type: "begin", size: 10 }, { type: "end", bytes: 10, chunks: 0 }],
    [{ type: "begin", size: 5 }, { type: "chunk", sequence: 1, data: "JVBERi0=" }],
    [{ type: "begin", size: 5 }, { type: "chunk", sequence: 0, data: "!!!!" }],
    [{ type: "begin", size: 5 }, { type: "chunk", sequence: 0, data: "YWJjZGU=" }, { type: "end", bytes: 5, chunks: 1 }]
  ];
  for (const messages of cases) {
    const fake = fakeApi(messages);
    await assert.rejects(readNetworkPdf(url, new AbortController().signal, fake.api));
    assert.equal(fake.isClosed(), true);
  }
});
test("Tabwechsel trennt eine laufende Übertragung", async () => {
  const controller = new AbortController();
  const fake = fakeApi(null);
  const pending = readNetworkPdf(url, controller.signal, fake.api);
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(fake.isClosed(), true);
});
test("Nicht erreichbarer Host und Zeitüberschreitung liefern Fehler statt Null", async () => {
  const fake = fakeApi(null);
  const pending = readNetworkPdf(url, new AbortController().signal, fake.api);
  await Promise.resolve();
  fake.disconnect();
  await assert.rejects(pending, /Windows-Helfer/);
  const slow = fakeApi(null);
  await assert.rejects(readNetworkPdf(url, new AbortController().signal, slow.api, 5), /zu lange/);
});
