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
import { SECURITY } from "./security";

/** So `moneyYears * 12` is a sentence rather than a magic 12 (`common/coding-style.md`). */
const MONTHS_IN_A_YEAR = 12;

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
  // **What an erasure keeps, and why** — 07 §6.1's promise as a value rather than a sentence somebody has to
  // remember to write, and ADR-179's home for it: a legal fact with one owner (07 §6.2's table), read by the
  // erasure job, by the confirmation the person sees and by any future subject-access answer, so the three
  // cannot drift apart. The *wording* is copy and is reviewed as copy; the *list* is the fact.
  //
  // `class` is the key the gate joins on: `scripts/ci/check-retention-classes.mjs` compares these names against
  // the classes `erase_account()` actually preserves, so a class added to one side and not the other fails
  // `config-gates` rather than being discovered by a data subject. `specRow` is its row in 07 §6.2.
  //
  // The third row is the one `0027` made true and the one most likely to be left out, because it applies to
  // nannies only and it is the least comfortable to say. It is said anyway: she is told that a vetting decision
  // about her is kept, that her identity is removed from it, and why. Art 17(3) is what makes keeping these rows
  // lawful; Art 12 is what makes telling her about them mandatory.
  // **Each row also carries its window, and the anchor the window runs from** (L-009 `3g`; 07 §6.1 step 6).
  // `purge-scrubbed-users` hard-deletes the `auth.users` row 30 days after the scrub **only if** nothing in
  // these classes is still inside its window — and the ruling for that job is that it reads *this* list rather
  // than a second copy of the dates in SQL. The window is expressed from `SECURITY.retention`, never typed
  // again: 07 §6.2 owns the numbers, and a class whose window disagrees with §6.2 is a wrong answer given
  // confidently.
  //
  // `from` matters as much as the number, and the two classes differ. Money runs from the **last transaction**
  // (§6.2 row 9 — HMRC and the Limitation Act both count from the event), consent runs from the **account
  // scrub** (row 11, in its own words). A job that used one anchor for both would be wrong for one of them and
  // would look right, so the anchor is a value the job reads rather than a rule it embeds.
  erasureRetains: Object.freeze([
    Object.freeze({
      class: "money",
      specRow: 9,
      what: "Payment and subscription records",
      why: "UK tax and company law require us to keep them, and they may be needed to settle a dispute.",
      lawfulBasis: "Art 17(3)(b) and (e)",
      windowMonths: SECURITY.retention.moneyYears * MONTHS_IN_A_YEAR,
      from: "last-activity",
    }),
    Object.freeze({
      class: "consent",
      specRow: 11,
      what: "A record of the permissions you gave, and when",
      why: "We have to be able to show what you agreed to and when you agreed to it.",
      lawfulBasis: "Art 17(3)(b)",
      windowMonths:
        SECURITY.retention.consentYearsAfterScrub * MONTHS_IN_A_YEAR,
      from: "scrub",
    }),
    Object.freeze({
      class: "safeguarding",
      specRow: 4,
      what: "Safeguarding decisions made about you, with your name and contact details removed",
      why: "Where a background-check decision has been made about someone who cares for children, we are accountable for that decision and have to be able to show who made it and why. Your identity is removed from the record; the decision itself is kept.",
      lawfulBasis: "Art 17(3)(b) and (e)",
      windowMonths: SECURITY.retention.dbsRecordAfterAccountMonths,
      from: "scrub",
    }),
  ] as const),
});
