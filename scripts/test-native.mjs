import { spawn } from "node:child_process";
import { mkdtemp, cp, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(path.join(root, "../native-protocol-test-"));
const executable = path.join(directory, "PdfNetworkHost.exe");
await cp(path.join(root, "native/bin/PdfNetworkHost.exe"), executable);
await cp(path.join(root, "native/bin/PdfNetworkHost.exe.config"), executable + ".config");
const origin = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/";
await writeFile(path.join(directory, "de.pdfanhaenge.network_reader.json"), JSON.stringify({ name: "de.pdfanhaenge.network_reader", allowed_origins: [origin] }));
function request(url, caller = origin) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [caller], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const chunks = []; let stderr = "";
    child.stdout.on("data", chunk => chunks.push(chunk));
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => {
      try {
        const raw = Buffer.concat(chunks), messages = []; let offset = 0;
        while (offset < raw.length) {
          const size = raw.readUInt32LE(offset); offset += 4;
          assert.ok(size <= 1024 * 1024);
          assert.ok(offset + size <= raw.length);
          messages.push(JSON.parse(raw.subarray(offset, offset + size).toString("utf8"))); offset += size;
        }
        resolve({ code, messages, stderr });
      } catch (error) { reject(error); }
    });
    const payload = Buffer.from(JSON.stringify({ command: "readPdf", url }));
    const header = Buffer.alloc(4); header.writeUInt32LE(payload.length);
    child.stdin.on("error", () => {});
    child.stdin.end(Buffer.concat([header, payload]));
  });
}
const invalidUrls = ["file:///C:/Windows/test.pdf", "https://server/a.pdf", "file://server/pipe/a.pdf", "file://server/IPC$/a.pdf",
  "file://server/share/a:stream.pdf", "file://server/share/NUL.pdf", "file://server/share/a.txt", "file://server/share/a.pdf?x=1",
  "file://server/share/NUL%20.pdf", "file://server/share/CONIN$.pdf", "file://server/share/a%3astream.pdf", "file://server/share/a%00.pdf"];
for (const url of invalidUrls) {
  const response = await request(url);
  assert.equal(response.messages[0]?.type, "error", url);
  assert.equal(response.messages.some(message => message.type === "begin"), false, url);
}
const denied = await request("file://server/share/a.pdf", "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/");
assert.equal(denied.code, 2);
assert.equal(denied.messages.length, 0);
console.log(`Native-Host: ${invalidUrls.length} unzulässige Adressen und eine fremde Erweiterungs-ID abgewiesen.`);
if (process.argv[2]) {
  const response = await request(process.argv[2]);
  assert.equal(response.code, 0, JSON.stringify(response));
  const [begin, ...rest] = response.messages;
  assert.equal(begin.type, "begin");
  const end = rest.pop();
  assert.equal(end.type, "end");
  for (let i = 0; i < rest.length; i++) assert.equal(rest[i].sequence, i);
  const bytes = Buffer.concat(rest.map(chunk => Buffer.from(chunk.data, "base64")));
  assert.equal(bytes.length, begin.size);
  assert.equal(bytes.length, end.bytes);
  const source = await readFile(fileURLToPath(process.argv[2]));
  assert.deepEqual(bytes, source);
  console.log(`Netzwerk-PDF über Host-Protokoll unverändert gelesen: ${bytes.length} Bytes, ${rest.length} Blöcke.`);
}
