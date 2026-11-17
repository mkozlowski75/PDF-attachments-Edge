import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const json = async name => JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), "utf8"));

test("Store-Beschreibung und Suchbegriffe halten die dokumentierten Grenzen ein", async () => {
  const listing = await json("store/listing.de-DE.json");
  assert.ok(listing.description.length >= 250 && listing.description.length <= 10000);
  assert.ok(listing.shortDescription.length <= 132);
  assert.ok(listing.searchTerms.length <= 7);
  assert.ok(listing.searchTerms.every(term => term.length <= 30));
  assert.ok(listing.searchTerms.join(" ").trim().split(/\s+/).length <= 21);
  const manifest = await json("extension/manifest.json");
  const messages = await json("extension/_locales/de/messages.json");
  assert.equal(manifest.default_locale, "de");
  assert.equal(manifest.name, "__MSG_extensionName__");
  assert.equal(manifest.description, "__MSG_extensionDescription__");
  assert.equal(listing.name, messages.extensionName.message);
  assert.equal(listing.shortDescription, messages.extensionDescription.message);
});

test("Jede angeforderte Berechtigung ist erklärt; kein extern gehosteter Code zugesagt", async () => {
  const manifest = await json("extension/manifest.json");
  const text = await readFile(new URL("../store/permissions.en.txt", import.meta.url), "utf8");
  for (const permission of manifest.permissions) assert.ok(text.includes(`\n${permission}\n`), permission);
  for (const permission of manifest.optional_permissions || []) assert.ok(text.includes(`\n${permission}\n`), permission);
  for (const host of manifest.host_permissions) assert.ok(text.includes(host), host);
  assert.match(text, /No remotely hosted extension code/);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.chrome_url_overrides, undefined);
  assert.equal(manifest.permissions.includes("nativeMessaging"), false);
  assert.deepEqual(manifest.optional_permissions, ["nativeMessaging"]);
});

test("MIT für Eigencode ersetzt die mitgelieferte Apache-Lizenz nicht", async () => {
  const license = await readFile(new URL("../LICENSE", import.meta.url), "utf8");
  assert.match(license, /^MIT License/);
  assert.match(license, /Permission is hereby granted, free of charge/);
  const pdfLicense = await readFile(new URL("../extension/vendor/PDFJS-LICENSE.txt", import.meta.url), "utf8");
  assert.match(pdfLicense, /Apache License/);
  const worker = await readFile(new URL("../extension/vendor/pdf.worker.mjs", import.meta.url), "utf8");
  assert.match(worker.slice(0, 500), /Modified for PDF-Anhänge für Edge/);
  const privacy = await readFile(new URL("../store/privacy.de.txt", import.meta.url), "utf8");
  assert.match(privacy, /ursprüngliche Dokumentadresse separat/);
  assert.match(privacy, /chrome\.storage\.session/);
});
