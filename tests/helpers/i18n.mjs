import { readFileSync } from "node:fs";

export const catalogs = Object.fromEntries(["de", "en", "pl"].map(locale => [locale,
  JSON.parse(readFileSync(new URL(`../../extension/_locales/${locale}/messages.json`, import.meta.url), "utf8"))]));

export function useLocale(locale) {
  const language = locale.replace("_", "-").split("-")[0];
  const catalog = catalogs[language] || catalogs.de;
  globalThis.chrome = { ...globalThis.chrome, i18n: {
    getUILanguage: () => locale,
    getMessage: (key, substitutions = []) => {
      const entry = catalog[key] || catalogs.de[key];
      if (!entry) return "";
      return entry.message.replace(/\$([a-z0-9_]+)\$/gi, (_match, name) =>
        entry.placeholders[name.toLowerCase()].content.replace(/\$([1-9])/g, (_position, index) => String(substitutions[index - 1] ?? "")));
    }
  } };
}

useLocale("de");
