import "./helpers/i18n.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeFilename, readWebPdf, withoutFragment, looksLikePdfUrl, isSupportedUrl, MAX_PDF_BYTES } from "../extension/core.js";

test("Dateinamen verhindern Pfade, Datenströme und Windows-Gerätenamen", () => {
  assert.equal(safeFilename("../../rechnung.xml"), "rechnung.xml");
  assert.equal(safeFilename("C:\\geheim\\rechnung.xml"), "rechnung.xml");
  assert.equal(safeFilename("datei.txt:stream"), "datei.txt_stream");
  assert.equal(safeFilename("CON.txt"), "_CON.txt");
  assert.equal(safeFilename("LPT1"), "_LPT1");
  assert.equal(safeFilename(". ."), "Anhang");
  assert.equal(safeFilename("Prüfung – Grüße.xml"), "Prüfung – Grüße.xml");
  assert.ok(safeFilename("a".repeat(250) + ".xml").endsWith(".xml"));
  assert.ok(safeFilename("a".repeat(250) + ".xml").length <= 180);
});

test("URLs werden ohne Änderung des Querystrings normalisiert", () => {
  assert.equal(withoutFragment("https://example.test/doc?id=2#page=3"), "https://example.test/doc?id=2");
  assert.equal(looksLikePdfUrl("file:///C:/Test/Datei.PDF#page=2"), true);
  assert.equal(isSupportedUrl("javascript:alert(1)"), false);
  assert.equal(isSupportedUrl("edge://settings"), false);
});

test("Web-PDF wird mit Sitzungsdaten abgerufen und binär unverändert gelesen", async () => {
  const expected = new TextEncoder().encode("%PDF-1.7\nTest");
  let options;
  const actual = await readWebPdf("https://example.test/file", new AbortController().signal, async (_url, opts) => {
    options = opts;
    return new Response(expected);
  });
  assert.equal(options.credentials, "include");
  assert.deepEqual(actual, expected);
});

test("Anmeldeseiten, HTTP-Fehler und zu große Dateien ergeben keine falsche leere Liste", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(readWebPdf("https://example.test/", signal, async () => new Response("<html>Anmeldung</html>")), /keine PDF/);
  await assert.rejects(readWebPdf("https://example.test/", signal, async () => new Response("", { status: 403 })), /HTTP 403/);
  await assert.rejects(readWebPdf("https://example.test/", signal, async () => new Response("", { headers: {"content-length": String(MAX_PDF_BYTES + 1)} })), /100 MB/);
});
