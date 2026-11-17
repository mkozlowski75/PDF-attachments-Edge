export function t(key, substitutions = []) {
  const values = (Array.isArray(substitutions) ? substitutions : [substitutions]).map(String);
  const message = globalThis.chrome?.i18n?.getMessage(key, values);
  if (!message) throw new Error(`Missing translation: ${key}`);
  return message;
}

export function currentLocale() {
  return t("locale");
}

export function attachmentCountMessage(count) {
  const category = new Intl.PluralRules(currentLocale()).select(count);
  return t(`attachmentsFound_${category}`, new Intl.NumberFormat(currentLocale()).format(count));
}

export function localizeDocument(document = globalThis.document) {
  document.documentElement.lang = currentLocale();
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const attribute of ["aria-label", "title"]) {
    for (const element of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
    }
  }
}
