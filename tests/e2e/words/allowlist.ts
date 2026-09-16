// 05 §5.3 — the banned-words allowlist: exact phrases keyed by screen id, each with the ruling that permits it.
// Read by the rendered Playwright test (`words.banned`); the static pre-check and the unit copy tests do not
// apply it. Adding a row needs a glossary §6 amendment or an ADR cited in the row (05 §5.3). No wildcard, no
// regex: a screen the document exempts wholesale (S-X-25) is a `screen` row, not a pattern.
export type WordAllowlistRow =
  | {
      readonly kind: "phrase";
      readonly screen: string;
      readonly phrase: string;
      readonly where: string;
      readonly ruling: string;
    }
  | {
      readonly kind: "screen";
      readonly screen: string;
      readonly ruling: string;
    };

export const WORD_ALLOWLIST: ReadonlyArray<WordAllowlistRow> = Object.freeze([
  {
    kind: "phrase",
    screen: "S-X-10",
    phrase: "Try Free Matchmaking",
    where: "the browse lead magnet only",
    ruling:
      "T-6.3 scoped exception (BAI 2026-09-08; ADR-056): the word is allowed on the matching lead magnet itself; the ban is on a free alternative to the bundle (00-glossary.md §6).",
  },
  {
    kind: "phrase",
    screen: "S-P-10",
    phrase: "fast track",
    where: "inside the bundle description",
    ruling:
      "00-glossary.md §6: banned on parent screens before the call; S-P-10 is post-call.",
  },
  {
    kind: "phrase",
    screen: "S-P-12",
    phrase: "fast track",
    where: "inside the bundle description",
    ruling:
      "00-glossary.md §6: banned on parent screens before the call; S-P-12 is post-call.",
  },
  {
    kind: "phrase",
    screen: "S-P-01",
    phrase: "Book my call",
    where:
      "the call page's action button only (button accessible name; not the heading, not the rail, not any email)",
    ruling:
      "00-glossary.md §6 scoped exception (R16 + F4 flag; A10, 2026-09-11): the action verb on the call page itself; wording confirmation rides with B-25 (DECISIONS §2).",
  },
  {
    kind: "phrase",
    screen: "S-N-02",
    phrase: "Book my call",
    where: "the call section's action only",
    ruling:
      "00-glossary.md §6 scoped exception (same ruling); S-N-02 is otherwise outside the test (nanny-facing, 04 §4.3 c2) — listed so the phrase's two homes are enumerated in one place and AC-N-33 is not widened by accident.",
  },
  {
    kind: "screen",
    screen: "S-X-25",
    ruling:
      "05 §5.3: legal documents (/legal/*) use their own vocabulary (T-3.3); reviewed by hand, not by the grep.",
  },
]);
