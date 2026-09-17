// ADR-124's wording sweep, folded into the unit (kickoff §4.5): the nanny surfaces never say the words glossary
// §8 bans for them — Sydney's check name, the currency sign, the city, "job", "tracking" — and S-X-24, a public
// page, also stays clear of the parent list (glossary §6). Read from the source, so a reword cannot pass by
// moving a sentence into a helper.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS = resolve(__dirname, "../components");
const LIB = resolve(__dirname, "../lib");

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });

/** glossary §8 "never say" for nanny surfaces + kickoff §4.5's list. Whole words, case-insensitive. */
const NANNY_BANNED = [
  /\bjobs?\b/i,
  /\bWWCC\b/,
  /\bOCG\b/,
  /\bpolice check\b/i,
  /\bSydney\b/,
  /\bsuburbs?\b/i,
  /\btracking\b/i,
  /\bcandidates?\b/i,
  /\bvetted\b/i,
  /\$\s?\d/,
];

/** glossary §6 — the parent list binds S-X-24 (04 §8 names S-X-20–S-X-25). */
const PARENT_BANNED = [
  /\bbook(s|ed|ing)?\b/i,
  /\binformation\b/i,
  /\bfast[ -]track\b/i,
  /\bcontinue\b/i,
  /\bprices?\b/i,
  /\bfees?\b/i,
  /\bfree\b/i,
  /\balternatives?\b/i,
  /\bdo it yourself\b/i,
  /\bupgrades?\b/i,
  /\boffers?\b/i,
  /\bconsultation\b/i,
  /\bsales\b/i,
];

/**
 * Strip comments, imports and class attributes: the rule is about copy — a comment may cite the banned word to
 * explain the ban, and a Tailwind class (`tracking-wide`) is not a sentence anyone reads.
 */
const copyOf = (file: string): string =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*|import )/.test(line))
    .join("\n")
    .replace(/className=\{`[^`]*`\}/g, "")
    .replace(/className=\{[^}]*\}/g, "")
    .replace(/className="[^"]*"/g, "")
    .replace(/^\s*"[^"]*(?:rounded|flex|text-|mt-|px-|py-)[^"]*",?$/gm, "");

describe("onboarding-nanny — copy (glossary §6 / §8; ADR-124 folded in)", () => {
  const files = [...listFiles(COMPONENTS), ...listFiles(LIB)].filter((f) =>
    /\.(tsx?|ts)$/.test(f),
  );

  it("has screens to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.replace(resolve(__dirname, ".."), "")]))(
    "%s never says a word the nanny list bans",
    (rel) => {
      const text = copyOf(resolve(__dirname, "..", `.${rel}`));
      for (const pattern of NANNY_BANNED)
        expect(text, `${rel} matches ${pattern}`).not.toMatch(pattern);
    },
  );

  it("S-X-24 (NannyEntryContent) also stays clear of the parent list — it is a public page", () => {
    const text = copyOf(resolve(COMPONENTS, "NannyEntryContent.tsx"));
    for (const pattern of PARENT_BANNED)
      expect(text, `S-X-24 matches ${pattern}`).not.toMatch(pattern);
  });
});
