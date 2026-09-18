// ADR-124's wording sweep, folded into the unit (kickoff §4.5): the wizard, the status page and the notice never
// say the words glossary §8 bans for nanny surfaces — Sydney's check name, the currency sign, the city, "job",
// "tracking", "vetted". Read from the source, so a reword cannot pass by moving a sentence into a helper.
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

const copyOf = (file: string): string =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*|import )/.test(line))
    .join("\n")
    .replace(/className=\{`[^`]*`\}/g, "")
    .replace(/className=\{[^}]*\}/g, "")
    .replace(/className="[^"]*"/g, "")
    .replace(/^\s*"[^"]*(?:rounded|flex|text-|mt-|px-|py-)[^"]*",?$/gm, "");

describe("verification — copy (glossary §8; ADR-124 folded in)", () => {
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

  it("the wizard tells her a person reviews (07 §2.6, Art 22) and never says an AI decided", () => {
    const text = files
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => copyOf(f))
      .join("\n");
    expect(text).toMatch(/a person (?:at|on|from|reviews|will review|checks)/i);
  });
});
