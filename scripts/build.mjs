import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { deflateSync } from "node:zlib";

const root = fileURLToPath(new URL("../", import.meta.url));
const vendor = path.join(root, "extension/vendor");
await mkdir(vendor, { recursive: true });
await cp(path.join(root, "node_modules/pdfjs-dist/build/pdf.mjs"), path.join(vendor, "pdf.mjs"));
await cp(path.join(root, "node_modules/pdfjs-dist/LICENSE"), path.join(vendor, "PDFJS-LICENSE.txt"));
let worker = await readFile(path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.mjs"), "utf8");

// PDF.js 5.4.394 liefert von sich aus nur den EmbeddedFiles-Namensbaum.
// Der ausschließlich lesende Zusatz berücksichtigt auch FileAttachment und AF.
const before = `  get attachments() {
    const obj = this.#catDict.get("Names");
    let attachments = null;
    if (obj instanceof Dict && obj.has("EmbeddedFiles")) {
      const nameTree = new NameTree(obj.getRaw("EmbeddedFiles"), this.xref);
      for (const [key, value] of nameTree.getAll()) {
        const fs = new FileSpec(value, this.xref);
        attachments ??= Object.create(null);
        attachments[stringToPDFString(key, true)] = fs.serializable;
      }
    }
    return shadow(this, "attachments", attachments);
  }`;
const after = `  get attachments() {
    // PDF-Anhaenge: include reachable file specifications in annotations and AF arrays.
    // Do not decode page/image content streams or follow external file references.
    let attachments = null;
    const pending = [this.#catDict];
    const visitedObjects = new Set();
    const visitedRefs = new Set();
    let inspected = 0;
    let totalBytes = 0;
    while (pending.length) {
      let value = pending.pop();
      if (value instanceof Ref) {
        const key = value.toString();
        if (visitedRefs.has(key)) continue;
        visitedRefs.add(key);
        value = this.xref.fetch(value);
      }
      if (!value || typeof value !== "object" || visitedObjects.has(value)) continue;
      visitedObjects.add(value);
      if (++inspected > 500000) throw new Error("Die PDF enthält zu viele Objekte für eine vollständige Untersuchung.");
      if (value instanceof BaseStream) value = value.dict;
      if (value instanceof Dict) {
        if (value.has("EF")) {
          const fs = new FileSpec(value, this.xref);
          const attachment = fs.serializable;
          totalBytes += attachment.content?.length || 0;
          if (totalBytes > 200 * 1024 * 1024) throw new Error("Die eingebetteten Anhänge überschreiten zusammen 200 MB.");
          attachments ??= Object.create(null);
          attachments["embedded-" + Object.keys(attachments).length] = attachment;
        }
        for (const key of value.getKeys()) pending.push(value.getRaw(key));
      } else if (Array.isArray(value)) {
        for (const child of value) pending.push(child);
      }
    }
    return shadow(this, "attachments", attachments);
  }`;
if (worker.split(before).length !== 2) throw new Error("PDF.js hat sich geändert: Anhangs-Patch muss überprüft werden.");
worker = worker.replace(before, after);
const contentBefore = "content = fileObj.getBytes();";
const contentAfter = `// PDF-Anhaenge: bound decoded attachment size, including compressed streams.
        // Small reads avoid reserving the entire size limit for every tiny attachment.
        fileObj.reset();
        const chunks = [];
        let length = 0;
        for (;;) {
          const bytes = fileObj.getBytes(Math.min(65536, 100 * 1024 * 1024 + 1 - length));
          if (!bytes.length) break;
          length += bytes.length;
          if (length > 100 * 1024 * 1024) throw new Error("Ein eingebetteter Anhang ist größer als 100 MB.");
          chunks.push(bytes.slice());
        }
        content = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length; }`;
if (worker.split(contentBefore).length !== 2) throw new Error("PDF.js hat sich geändert: Größenbegrenzung muss überprüft werden.");
worker = worker.replace(contentBefore, contentAfter);
worker = `/*
 * Modified for PDF-Anhänge für Edge, 2026-11-17.
 * Changes: read-only enumeration of reachable embedded file specifications
 * (including annotations and AF), plus bounded, incremental attachment decoding.
 * Mozilla PDF.js 5.4.394, including these modifications, remains under Apache-2.0.
 * See PDFJS-MODIFICATIONS.txt and PDFJS-LICENSE.txt in distribution packages.
 */\n` + worker;
await writeFile(path.join(vendor, "pdf.worker.mjs"), worker);

// Kleine, selbst erzeugte PNG-Symbole ohne zusätzliche Grafik-Abhängigkeit.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, bytes) {
  const type = Buffer.from(name);
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
  return Buffer.concat([length, type, bytes, crc]);
}
function icon(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const u = x / size, v = y / size;
      const paper = u > .25 && u < .73 && v > .14 && v < .85;
      const line = paper && u > .35 && u < .63 && ((v > .35 && v < .40) || (v > .49 && v < .54) || (v > .63 && v < .68));
      raw.set(paper && !line ? [242, 251, 248, 255] : [18, 107, 96, 255], i);
    }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
await mkdir(path.join(root, "extension/icons"), { recursive: true });
for (const size of [16,32,48,128]) await writeFile(path.join(root, `extension/icons/${size}.png`), icon(size));
console.log("Erweiterung einschließlich PDF-Bibliothek und Symbolen gebaut.");
