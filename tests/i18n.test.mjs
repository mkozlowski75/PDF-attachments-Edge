import { catalogs, useLocale } from "./helpers/i18n.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { t, attachmentCountMessage, localizeDocument, currentLocale } from "../extension/i18n.js";
import { formatBytes } from "../extension/core.js";
import { localizeNativeError } from "../extension/native-errors.js";

test("Alle drei Sprachen enthalten sämtliche Oberflächen- und Manifesttexte", async () => {
  const keys = Object.keys(catalogs.de).sort();
  for (const [locale, catalog] of Object.entries(catalogs)) {
    assert.deepEqual(Object.keys(catalog).sort(), keys, locale);
    for (const [key, entry] of Object.entries(catalog)) {
      assert.ok(entry.message.trim(), `${locale}:${key}`);
      assert.deepEqual(Object.keys(entry.placeholders || {}).sort(), Object.keys(catalogs.de[key].placeholders || {}).sort(), `${locale}:${key}`);
      for (const match of entry.message.matchAll(/\$([a-z0-9_]+)\$/gi)) {
        assert.ok(entry.placeholders?.[match[1]], `${locale}:${key}:${match[1]}`);
      }
    }
  }
  const extension = new URL("../extension/", import.meta.url);
  for (const file of await readdir(extension)) {
    if (!/\.(?:js|html|json)$/.test(file)) continue;
    const source = await readFile(new URL(file, extension), "utf8");
    for (const match of source.matchAll(/(?:\bt\("|data-i18n(?:-aria-label|-title)?="|__MSG_)([a-zA-Z0-9_]+)/g)) {
      const key = match[1].replace(/__$/, "");
      assert.ok(catalogs.de[key], `${file}:${key}`);
    }
  }
});

test("Englisch und Polnisch werden gewählt; andere Sprachen fallen auf Deutsch zurück", () => {
  for (const [locale, expected] of [["en-US", "PDF Attachments"], ["pl-PL", "Załączniki PDF"], ["de-CH", "PDF-Anhänge"], ["fr", "PDF-Anhänge"]]) {
    useLocale(locale);
    assert.equal(t("panelTitle"), expected);
  }
});

test("Polnische Mehrzahlformen stimmen auch bei 12, 21, 22 und 112 Anhängen", () => {
  useLocale("pl");
  for (const [count, form] of [[1, "załącznik."], [2, "załączniki."], [5, "załączników."], [12, "załączników."], [21, "załączników."], [22, "załączniki."], [101, "załączników."], [102, "załączniki."], [112, "załączników."]]) {
    assert.ok(attachmentCountMessage(count).includes(`${count} ${form}`), String(count));
  }
  useLocale("en");
  assert.match(attachmentCountMessage(1), /^1 attachment found/);
  assert.match(attachmentCountMessage(2), /^2 attachments found/);
  useLocale("de");
  assert.match(attachmentCountMessage(1), /^1 Anhang gefunden/);
});

test("Dateigrößen und Platzhalter verwenden die gewählte Sprache", () => {
  for (const [locale, expected] of [["de", "1,5 KB"], ["en", "1.5 KB"], ["pl", "1,5 KB"]]) {
    useLocale(locale);
    assert.equal(formatBytes(1536), expected);
    assert.ok(t("attachmentsUnreadable", [3, 2]).includes("3"));
    assert.ok(t("errorHttp", 403).includes("HTTP 403"));
  }
});

test("Vorhandene Windows-Helfer liefern lokalisierte statt fest deutscher Fehler", () => {
  for (const [locale, expected] of [["en", "not found"], ["pl", "Nie znaleziono"], ["de", "nicht gefunden"]]) {
    useLocale(locale);
    assert.ok(localizeNativeError("Die Netzwerk-PDF wurde nicht gefunden. Bitte die Freigabe und die Adresse prüfen.").includes(expected));
    assert.equal(localizeNativeError("Unbekannte Helferversion"), t("errorNetworkRead"));
  }
});

test("HTML-Sprache und zugängliche Beschriftungen werden gemeinsam übersetzt", () => {
  useLocale("pl");
  const title = { dataset: { i18n: "panelTitle" }, textContent: "" };
  const count = { getAttribute: () => "attachmentCountLabel", setAttribute(name, value) { this[name] = value; } };
  const document = { documentElement: {}, querySelectorAll(selector) {
    return selector === "[data-i18n]" ? [title] : selector === "[data-i18n-aria-label]" ? [count] : [];
  } };
  localizeDocument(document);
  assert.equal(document.documentElement.lang, currentLocale());
  assert.equal(title.textContent, "Załączniki PDF");
  assert.equal(count["aria-label"], "Liczba załączników");
});
