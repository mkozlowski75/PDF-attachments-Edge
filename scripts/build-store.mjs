import { mkdir, cp, readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const outputArgument = process.argv.indexOf("--output");
const output = outputArgument >= 0 ? path.resolve(process.argv[outputArgument + 1]) : path.join(root, "dist");
const release = path.join(output, "Edge-Store-Veroeffentlichung-1.2.0");
const upload = path.join(release, "Store-Paket");
const source = path.join(release, "Quellcode-MIT");
const config = JSON.parse(await readFile(path.join(root, "store/publisher.json"), "utf8"));
const listing = JSON.parse(await readFile(path.join(root, "store/listing.de-DE.json"), "utf8"));
const blockers = [];
if (!config.publisherName) blockers.push("Herausgeber-/Organisationsname ergänzen.");
if (!config.supportContact) blockers.push("Öffentlichen Support-/Datenschutzkontakt ergänzen.");
if (!config.privacyPolicyUrl) blockers.push("Datenschutzerklärung vervollständigen, veröffentlichen und ihre öffentliche URL eintragen.");
if (!config.nativeHelperDownloadUrl) blockers.push("Öffentliche Download-URL für den optionalen Windows-Helfer bereitstellen und verlinken.");
if (!config.storeExtensionId) blockers.push("Nach der ersten Store-Anlage die Store-Erweiterungs-ID für die Helferinstallation dokumentieren.");
if (config.privacyPolicyUrl && !/^https:\/\/[^\s]+$/i.test(config.privacyPolicyUrl)) {
  blockers.push("Die konfigurierte Datenschutz-URL ist keine gültige HTTPS-Adresse; vor Einreichung prüfen.");
}
await mkdir(upload, { recursive: true });
await mkdir(source, { recursive: true });
await cp(path.join(root, "extension"), upload, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(upload, "manifest.json"), "utf8"));
// Nur das Store-Paket erhält keine lokale Entwicklungskennung. Die bestehende
// Installation und das Entwicklungsmanifest werden nicht verändert.
delete manifest.key;
delete manifest.update_url;
await writeFile(path.join(upload, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const license = (await readFile(path.join(root, "LICENSE"), "utf8"))
  .replace("Copyright (c) 2026 PDF-Anhänge für Edge contributors", `Copyright (c) 2026 ${config.copyrightHolder || "PDF-Anhänge für Edge contributors"}`);
await writeFile(path.join(upload, "LICENSE"), license);
await writeFile(path.join(release, "LICENSE"), license);
const notices = `PDF-Anhänge für Edge – Lizenzumfang\n\nEigener Erweiterungscode und eigene Dokumentation: MIT; siehe LICENSE.\nCopyright (c) 2026 ${config.copyrightHolder || "PDF-Anhänge für Edge contributors"}.\n\nMozilla PDF.js 5.4.394, einschließlich lokaler Anpassungen:\nCopyright Mozilla Foundation und weitere Mitwirkende.\nApache License, Version 2.0; siehe vendor/PDFJS-LICENSE.txt.\nDie MIT-Lizenz ersetzt diese Bibliothekslizenz nicht.\n\nDie lokalen Änderungen sind in PDFJS-MODIFICATIONS.txt beschrieben und im\nPDF.js-Worker kenntlich gemacht. Ursprüngliche Copyright- und Lizenzhinweise\nbleiben in den Bibliotheksdateien enthalten.\n`;
await writeFile(path.join(upload, "THIRD-PARTY-NOTICES.txt"), notices);
await cp(path.join(root, "store/PDFJS-MODIFICATIONS.txt"), path.join(upload, "PDFJS-MODIFICATIONS.txt"));

const texts = `STORE-EINTRAG – DEUTSCH (de-DE)\n\nName\n${listing.name}\n\nKurzbeschreibung / Manifest-Beschreibung\n${listing.shortDescription}\n\nEmpfohlene Kategorie\n${listing.categorySuggestion}\n\nEinziger Zweck\n${listing.singlePurpose}\n\nBeschreibung\n${listing.description}\n\nSuchbegriffe (jeweils einzeln eintragen)\n${listing.searchTerms.join("\n")}\n\nVersionshinweise\n${listing.releaseNotes}\n`;
await writeFile(path.join(release, "Store-Texte.de.txt"), texts);
await cp(path.join(root, "store/listing.de-DE.json"), path.join(release, "Store-Metadaten.de-DE.json"));
for (const [from, to] of [
  ["permissions.en.txt", "Berechtigungen-und-Zweck.en.txt"],
  ["data-declarations.de.txt", "Datenverwendung.de.txt"],
  ["certification.en.txt", "Hinweise-fuer-Zertifizierung.en.txt"],
  ["submission-checklist.de.txt", "Einreichungsanleitung.de.txt"],
  ["publisher.json", "Herausgeber-Konfiguration.json"]
]) await cp(path.join(root, "store", from), path.join(release, to));
const policy = (await readFile(path.join(root, "store/privacy.de.txt"), "utf8"))
  .replaceAll("{{DATE}}", "17. November 2026")
  .replaceAll("{{PUBLISHER}}", config.publisherName || "[HERAUSGEBER EINTRAGEN]")
  .replaceAll("{{SUPPORT}}", config.supportContact || "[OEFFENTLICHEN KONTAKT EINTRAGEN]");
await writeFile(path.join(release, "Datenschutzerklaerung.txt"), policy);
const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const policyHtml = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Datenschutz – PDF-Anhänge für Edge</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:850px;margin:40px auto;padding:0 24px;color:#172536}h1{font-size:28px}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}.note{padding:15px;background:#fff3d4;border-radius:8px}</style></head><body><h1>Datenschutz</h1>${blockers.length ? '<p class="note">Entwurf: Herausgeber-/Kontaktangaben und Hinweise zum tatsächlichen Hosting-/Supportweg vor Veröffentlichung vervollständigen.</p>' : ""}<pre>${escape(policy)}</pre></body></html>`;
await writeFile(path.join(release, "Datenschutzerklaerung.html"), policyHtml);
await cp(path.join(root, "extension/icons/128.png"), path.join(release, "Store-Logo-128.png"));
await mkdir(path.join(release, "Pruefdateien"), { recursive: true });
await cp(path.join(root, "tests/fixtures/mixed.pdf"), path.join(release, "Pruefdateien/Test-PDF-mit-vier-Anhaengen.pdf"));
await cp(path.join(root, "tests/fixtures/empty.pdf"), path.join(release, "Pruefdateien/Test-PDF-ohne-Anhaenge.pdf"));

// Bewusste Dateiliste: keine Browserprofile, Downloadkopien, Nutzerdaten,
// Chat-Bestätigungen, node_modules oder lokalen Testprotokolle veröffentlichen.
for (const file of ["package.json", "package-lock.json", "README.md", "LICENSE", "THIRD-PARTY-NOTICES.txt",
  "scripts/build.mjs", "scripts/build-store.mjs", "scripts/fixtures.mjs", "scripts/native-open-probe.mjs",
  "scripts/build-native.mjs", "scripts/test-native.mjs", "scripts/test-network-edge.mjs", "scripts/test-locales-edge.mjs",
  "tests/core.test.mjs", "tests/extraction.test.mjs", "tests/network.test.mjs", "tests/store.test.mjs", "tests/i18n.test.mjs", "tests/helpers/i18n.mjs"]) {
  await cp(path.join(root, file), path.join(source, file), { recursive: true });
}
await writeFile(path.join(source, "LICENSE"), license);
await writeFile(path.join(source, "THIRD-PARTY-NOTICES.txt"), notices
  .replaceAll("vendor/PDFJS-LICENSE.txt", "extension/vendor/PDFJS-LICENSE.txt")
  .replaceAll("in PDFJS-MODIFICATIONS.txt", "in extension/PDFJS-MODIFICATIONS.txt"));
await cp(path.join(root, "extension"), path.join(source, "extension"), { recursive: true });
await cp(path.join(root, "store"), path.join(source, "store"), { recursive: true });
await cp(path.join(root, "native"), path.join(source, "native"), { recursive: true });
await cp(path.join(root, "tests/fixtures"), path.join(source, "tests/fixtures"), { recursive: true });
await cp(path.join(root, "store/PDFJS-MODIFICATIONS.txt"), path.join(source, "extension/PDFJS-MODIFICATIONS.txt"));
await writeFile(path.join(source, "extension/LICENSE"), license);
await writeFile(path.join(source, "extension/THIRD-PARTY-NOTICES.txt"), notices);
await writeFile(path.join(source, "QUELLCODE-STORE.txt"), `Eigencode: MIT. PDF.js einschließlich Anpassungen: Apache 2.0.\n\nNode.js 24 installieren, dann:\nnpm ci --ignore-scripts\nnpm run build\nnpm run fixtures\nnpm test\nnpm run test:store\nnpm run build:native\nnpm run build:store\n\nDer Store-Build erstellt die Ausgabeverzeichnisse. Danach unter Windows\ndie beiden ZIP-Pakete erstellen:\npowershell.exe -NoProfile -File .\\store\\archive.ps1 -ReleaseRoot .\\dist\\Edge-Store-Veroeffentlichung-1.2.0\n\nHerausgeberangaben stehen in store/publisher.json. Das Entwicklungsmanifest\nenthält einen öffentlichen key für reproduzierbare Tests; der Store-Build\nentfernt diesen nur in seiner Ausgabekopie. Kein privater Schlüssel liegt bei.\n\nDer vollständige Windows-Test npm run test:edge öffnet ein getrenntes temporäres\nEdge-Profil und einen synthetischen Textanhang. Er ist kein Nachweis einer\nStore-Zertifizierung und verändert das normale Edge-Profil nicht.\n`);

const helper = path.join(release, "Windows-Netzwerk-Helfer");
await cp(path.join(root, "native/bin"), helper, { recursive: true });
await cp(path.join(root, "native/README.txt"), path.join(helper, "Details.txt"));
// Die öffentliche Helfervariante autorisiert keine Entwicklungs-ID automatisch.
await writeFile(path.join(helper, "Installieren.cmd"), '@echo off\r\n"%~dp0PdfNetworkHost.exe" --install\r\npause\r\n');
await writeFile(path.join(helper, "LIES-MICH.txt"), "Windows-Helfer fuer die Store-Fassung: Installieren.cmd starten und die genaue Store-Erweiterungs-ID aus edge://extensions einfuegen. Danach in der Seitenleiste einmal Netzwerkzugriff aktivieren. Keine Administratorrechte erforderlich. Lokale/Web-PDFs funktionieren auch ohne Helfer. Details siehe Details.txt.\r\n");
const criticalFiles = ["background.js", "core.js", "network.js", "i18n.js", "native-errors.js", "_locales/de/messages.json", "_locales/en/messages.json", "_locales/pl/messages.json", "sidepanel.js", "sidepanel.html", "sidepanel.css", "vendor/pdf.mjs", "vendor/pdf.worker.mjs"];
const runtimeComparison = {};
for (const file of criticalFiles) {
  const input = await readFile(path.join(root, "extension", file));
  const packed = await readFile(path.join(upload, file));
  if (!input.equals(packed)) throw new Error(`Unerwartete Änderung im Funktionscode: ${file}`);
  runtimeComparison[file] = createHash("sha256").update(packed).digest("hex");
}
const contents = await readdir(upload);
if (!contents.includes("manifest.json") || contents.includes("node_modules")) throw new Error("Ungültige Paketstruktur.");
await writeFile(path.join(release, "Vorbereitung-Pruefbericht.json"), JSON.stringify({
  version: manifest.version, packageRootManifest: true, developmentKeyRemoved: !manifest.key,
  runtimeComparison, ownCodeLicense: "MIT", bundledPdfjsLicense: "Apache-2.0",
  automatedChecks: { functional: 8, network: 9, storePreparation: 3, localization: 6, total: 26 },
  optionalNativeMessaging: true, helperDownloadUrl: config.nativeHelperDownloadUrl,
  publisherFieldsPending: blockers, privacyHostingAndSupportDetailsRequirePublisherReview: true,
  storeSubmissionPerformed: false, certificationGranted: false
}, null, 2));
const intro = `PDF-Anhänge für Edge – Store-Vorbereitung 1.2.0\n\nDas technisch vorbereitete Store-Paket heißt PDF-Anhaenge-Edge-1.2.0-store.zip.\nEs enthält ausschließlich die Erweiterung und ihre Lizenzhinweise. Nur dieses\nZIP in Partner Center als Erweiterungspaket hochladen. Der Ordner Store-Paket\nenthält dieselben Dateien entpackt.\n\nEigener Code: MIT. PDF.js: Apache 2.0.\nVersion 1.2.0 ergänzt Englisch und Polnisch neben Deutsch; Entwicklungs-key nur in der Store-Kopie entfernt.\nDas Logo entspricht dem dokumentierten Mindestmaß 128 x 128. Screenshots sind\noptional und werden nicht mit einer erfundenen Oberfläche ersetzt.\n\n${blockers.length ? 'Vor Einreichung noch zu ergänzen:\n' + blockers.map(b => '- ' + b).join('\n') : 'Herausgeberangaben wurden übernommen; öffentliche URLs vor Einreichung auf Erreichbarkeit prüfen.'}\n\nHosting-/Supportangaben in der Datenschutzerklärung müssen zur tatsächlichen\nVeröffentlichung passen. Es wurde nichts hochgeladen oder veröffentlicht.\n\nStart: Einreichungsanleitung.de.txt\nStore-Inhalte: Store-Texte.de.txt\nDatenschutz: Datenschutzerklaerung.html\nMicrosoft-Prüfung: Hinweise-fuer-Zertifizierung.en.txt\n`;
await writeFile(path.join(release, "START-HIER.txt"), intro);
await writeFile(path.join(release, "Uebersicht.html"), `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Store-Vorbereitung – PDF-Anhänge für Edge</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:850px;margin:40px auto;padding:0 24px;color:#172536}h1{font-size:30px}a{color:#126b60}pre{font:inherit;white-space:pre-wrap}.note{background:#fff3d4;padding:16px;border-radius:10px}li{margin:10px 0}</style><h1>Store-Vorbereitung</h1><p>PDF-Anhänge für Edge · Version 1.2.0</p><p>Eigener Code unter MIT-Lizenz; PDF.js unter Apache 2.0.</p><ul><li><a href="PDF-Anhaenge-Edge-1.2.0-store.zip">Store-Paket zum Hochladen</a></li><li><a href="Store-Texte.de.txt">Beschreibung, Suchbegriffe und Versionshinweise</a></li><li><a href="Datenschutzerklaerung.html">Datenschutzerklärung zum Veröffentlichen</a></li><li><a href="Berechtigungen-und-Zweck.en.txt">Zweck und Berechtigungsbegründungen</a></li><li><a href="Datenverwendung.de.txt">Angaben zur Datenverwendung</a></li><li><a href="Hinweise-fuer-Zertifizierung.en.txt">Hinweise für die Zertifizierungsprüfung</a></li><li><a href="Einreichungsanleitung.de.txt">Einreichungsanleitung</a></li><li><a href="Windows-Netzwerk-Helfer-1.2.0.zip">Optionaler Windows-Netzwerk-Helfer</a></li><li><a href="Store-Logo-128.png">Store-Logo</a></li><li><a href="PDF-Anhaenge-Edge-1.2.0-MIT-Quellcode.zip">Separates MIT-Quellcodepaket</a></li></ul>${blockers.length ? '<div class="note"><strong>Vor Einreichung ergänzen</strong><ul>' + blockers.map(b => '<li>' + escape(b) + '</li>').join('') + '</ul></div>' : ''}<p>Die Store-Einreichung und eine Veröffentlichung wurden nicht durchgeführt. Eine Freigabe kann erst Microsoft nach der Zertifizierung erteilen.</p></html>`);
console.log(JSON.stringify({ release, upload, source, pendingPublisherFields: blockers }, null, 2));
