// 01 §3.1 — the locale, once (ADR-029; ADR-102 `+44` only). Formatting helpers live in the module that formats.
export const LOCALE = Object.freeze({
  currency: "GBP",
  locale: "en-GB",
  timezone: "Europe/London",
  phoneCountry: "GB",
  phonePrefix: "+44",
});
