import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { makePdf } from "../scripts/fixtures.mjs";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const pdfjs = await import("../extension/vendor/pdf.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = new URL("../extension/vendor/pdf.worker.mjs", import.meta.url).href;
async function extract(bytes) {
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, stopAtErrors: true });
  try {
    const pdf = await task.promise;
    return Object.values((await pdf.getAttachments()) || {});
  } finally { await task.destroy(); }
}

test("Namensbaum, Seitenanmerkung und AF liefern Namen und unveränderte Dateiinhalte", async () => {
  const { bytes, payloads } = await makePdf();
  const attachments = await extract(bytes);
  assert.equal(attachments.length, 4);
  assert.deepEqual(new Set(attachments.map(a => a.rawFilename)), new Set(payloads.keys()));
  for (const attachment of attachments) {
    assert.deepEqual(attachment.content, payloads.get(attachment.rawFilename));
    assert.equal(attachment.content.buffer.byteLength, attachment.content.length,
      "Kleine Anhänge dürfen keinen großen Decoder-Puffer festhalten");
  }
});

test("PDF ohne Anhänge liefert eine nachgewiesene leere Liste", async () => {
  const { bytes } = await makePdf("empty");
  assert.deepEqual(await extract(bytes), []);
});

test("Gleiche Namen verschiedener Dateien bleiben erhalten, doppelte Referenzen nicht", async () => {
  const { bytes } = await makePdf("duplicates");
  const attachments = await extract(bytes);
  const duplicateNames = attachments.filter(a => a.rawFilename === "gleich.txt");
  assert.equal(duplicateNames.length, 2);
  assert.deepEqual(new Set(duplicateNames.map(a => new TextDecoder().decode(a.content))), new Set(["Inhalt A", "Inhalt B"]));
});

test("Ungültige Datei wird als Fehler erkannt", async () => {
  await assert.rejects(extract(new TextEncoder().encode("keine PDF-Datei")));
});
