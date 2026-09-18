// 01 §3.1 — the jurisdiction, once (ADR-171; row `12.08`). Governing law, the courts named, the regulator and its
// registration number, the statutory references of 07 §2.3 and the trading entity are values, never literals — the
// same rule that already holds brand, domain, currency and timezone. Currency and timezone are NOT repeated here:
// they are `LOCALE.currency` / `LOCALE.timezone` (ADR-029), and `config.legal` asserts this file does not shadow them.
//
// **Naming a statute is not a claim that it binds us.** Applicability is the document's, and whether the Conduct
// Regulations apply at all is still open (07 §11 item 10 / FATE `10.40`) — the name is here so no body has to type it.
//
// **The entity's own values are not invented.** `legalName` is 07 §2.1 / ADR-072. The company number, the registered
// office and the ICO registration number do not exist until BAI's Ltd does (07 §11 item 3, B-35), so each carries the
// house `@pending:B-nn` sentinel and `config.legal` asserts each is *still* the sentinel — replacing one fails a test,
// which is the point: a plausible number must never ship unnoticed as if it were real.
export const LEGAL = Object.freeze({
  governingLaw: "England and Wales", // 04 §2 S-X-25; 08 §2 step 8
  courts: "the courts of England and Wales",
  regulator: Object.freeze({
    name: "Information Commissioner's Office",
    shortName: "ICO",
    registrationNumber: "@pending:B-35", // 07 §2.2 — rendered on /legal/disclaimer (FATE `10.07`), never a literal
  }),
  // 07 §2.3 "Law", verbatim in intent; one key per reference, no versions and no bodies.
  statutes: Object.freeze({
    ukGdpr: "UK GDPR",
    dataProtectionAct: "Data Protection Act 2018",
    pecr: "PECR 2003",
    consumerContractsRegulations: "Consumer Contracts Regulations 2013",
    consumerRightsAct: "Consumer Rights Act 2015",
    employmentAgenciesAct: "Employment Agencies Act 1973",
    conductRegulations: "Conduct Regulations 2003", // applicability is 07 §11 item 10, not this file's
  }),
  entity: Object.freeze({
    legalName: "BabyBloom London Ltd", // 07 §2.1 (ADR-072) — the controller named in every document
    companyNumber: "@pending:B-35",
    registeredOffice: "@pending:B-35",
  }),
});
