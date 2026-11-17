import { PDFDocument, PDFName, PDFHexString } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("../tests/fixtures/", import.meta.url));
await mkdir(target, { recursive: true });
const encoder = new TextEncoder();

export async function makePdf(kind = "mixed") {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  page.drawText("PDF-Anhaenge - Testdokument", { x: 50, y: 780, size: 20 });
  page.drawText("Dieses PDF bleibt im eingebauten Edge-Viewer sichtbar.", { x: 50, y: 750, size: 12 });
  const payloads = new Map();
  async function attach(name, text) {
    const bytes = encoder.encode(text);
    payloads.set(name, bytes);
    await pdf.attach(bytes, name, { mimeType: "text/plain", description: "Synthetischer Testanhang" });
  }
  function standalone(name, text) {
    const bytes = encoder.encode(text);
    payloads.set(name, bytes);
    const stream = pdf.context.register(pdf.context.flateStream(bytes, { Type: "EmbeddedFile" }));
    return pdf.context.register(pdf.context.obj({
      Type: "Filespec", F: PDFHexString.fromText(name), UF: PDFHexString.fromText(name),
      Desc: PDFHexString.fromText("Separat eingebetteter Testanhang"), EF: { F: stream, UF: stream }
    }));
  }
  if (kind !== "empty") {
    await attach("Hinweise.txt", "Test erfolgreich: Dieser Anhang wurde aus der PDF entnommen.\r\n");
    await attach("Prüfung – Grüße.xml", '<?xml version="1.0" encoding="UTF-8"?><test>Grüße aus der PDF</test>');
  }
  if (kind === "mixed") {
    const af = standalone("Nur-AF.csv", "Spalte;Wert\r\nTest;123\r\n");
    pdf.catalog.set(PDFName.of("AF"), pdf.context.obj([af]));
    const fs = standalone("Seiten-Anhang.txt", "Dieser Anhang ist nur über eine Seitenanmerkung erreichbar.\r\n");
    const annotation = pdf.context.register(pdf.context.obj({ Type: "Annot", Subtype: "FileAttachment", Rect: [40,650,60,670], FS: fs }));
    page.node.set(PDFName.of("Annots"), pdf.context.obj([annotation]));
    // Derselbe Filespec wird zweimal referenziert, darf aber nur einmal erscheinen.
    page.node.set(PDFName.of("AF"), pdf.context.obj([af]));
  }
  if (kind === "duplicates") {
    const first = standalone("gleich.txt", "Inhalt A");
    const second = standalone("gleich.txt", "Inhalt B");
    pdf.catalog.set(PDFName.of("AF"), pdf.context.obj([first, second]));
  }
  return { bytes: await pdf.save(), payloads };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const kind of ["mixed", "empty", "duplicates"]) {
    const { bytes } = await makePdf(kind);
    await writeFile(`${target}${kind}.pdf`, bytes);
  }
  await writeFile(`${target}invalid.pdf`, "Keine PDF-Datei");
  console.log("PDF-Testdateien erzeugt.");
}
