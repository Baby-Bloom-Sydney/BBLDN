// The jurisdiction, once (01 §3.1; ADR-171; row `12.08`). Three claims this merge rests on, each executable:
//   1. `LEGAL` says England and Wales, names the ICO, and carries 07 §2.3's statute set — so a policy seed reads
//      the jurisdiction rather than typing it into a body.
//   2. Every value B-35 owns is **still** the `@pending:B-35` sentinel (07 §11 item 3, 07 §2.2). Filling one in is
//      therefore a change that fails a test and has to be noticed, not a plausible string that ships as if real.
//   3. No Australian jurisdiction fact is reachable through `LEGAL`, and the gate that keeps the whole class out of
//      shipped code catches each fact it names (`scripts/ci/check-config-literals.mjs`, rule `jurisdiction`).
// Needles are assembled from fragments so this file does not itself carry what the gate greps for — the same reason
// `config.repo.test.ts` assembles its own (01 §1.3 rule 1's needle).
import { describe, expect, it } from "vitest";
import { LEGAL, LOCALE } from "@/modules/config";
import { RULES } from "../../../../scripts/ci/check-config-literals.mjs";

const PENDING = "@pending:B-35";

/** Every string reachable through a frozen config value, with its path. */
function strings(
  value: unknown,
  path: string,
): readonly (readonly [string, string])[] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => strings(child, `${path}.${key}`),
  );
}

const jurisdictionRule = () => {
  const rule = RULES.find(
    (entry: { rule: string }) => entry.rule === "jurisdiction",
  );
  if (!rule)
    throw new Error("check-config-literals has no `jurisdiction` rule");
  return rule as { rule: string; pattern: RegExp };
};

describe("config/legal — the jurisdiction is England and Wales (ADR-171)", () => {
  it("names the governing law, the courts and the regulator", () => {
    expect(LEGAL.governingLaw).toBe("England and Wales");
    expect(LEGAL.courts).toBe("the courts of England and Wales");
    expect(LEGAL.regulator.name).toBe("Information Commissioner's Office");
    expect(LEGAL.regulator.shortName).toBe("ICO");
  });

  it("carries exactly 07 §2.3's statute set, so no body has to type one", () => {
    expect(Object.keys(LEGAL.statutes).sort()).toEqual([
      "conductRegulations",
      "consumerContractsRegulations",
      "consumerRightsAct",
      "dataProtectionAct",
      "employmentAgenciesAct",
      "pecr",
      "ukGdpr",
    ]);
    expect(LEGAL.statutes.ukGdpr).toBe("UK GDPR");
    expect(LEGAL.statutes.dataProtectionAct).toBe("Data Protection Act 2018");
  });

  it("does not duplicate the currency or the timezone — those stay in LOCALE (ADR-029)", () => {
    const keys = strings(LEGAL, "LEGAL").map(([path]) => path);
    expect(keys.some((path) => /currency|timezone/i.test(path))).toBe(false);
    expect(LOCALE.currency).toBe("GBP");
    expect(LOCALE.timezone).toBe("Europe/London");
  });
});

describe("config/legal — the entity's own values are a placeholder, and stay one", () => {
  it("carries the legal name from 07 §2.1 (ADR-072), which is not a placeholder", () => {
    expect(LEGAL.entity.legalName).toBe("BabyBloom London Ltd");
    expect(LEGAL.entity.legalName).not.toBe(PENDING);
  });

  it.each([
    ["entity.companyNumber", () => LEGAL.entity.companyNumber],
    ["entity.registeredOffice", () => LEGAL.entity.registeredOffice],
    ["regulator.registrationNumber", () => LEGAL.regulator.registrationNumber],
  ])(
    "%s is STILL the @pending:B-35 sentinel — replacing it must fail this test, not ship quietly",
    (_name, read) => {
      expect(read()).toBe(PENDING);
    },
  );

  it("leaves nothing else pending: every other value is a real one", () => {
    const pending = strings(LEGAL, "LEGAL").filter(([, value]) =>
      value.startsWith("@pending:"),
    );
    expect(pending.map(([path]) => path).sort()).toEqual([
      "LEGAL.entity.companyNumber",
      "LEGAL.entity.registeredOffice",
      "LEGAL.regulator.registrationNumber",
    ]);
  });
});

describe("config/legal — no Australian jurisdiction fact is reachable (row `12.08`)", () => {
  // Assembled from fragments: the needle must exist at runtime and not in this file's source.
  const FACTS: readonly (readonly [string, readonly string[]])[] = [
    ["the state", ["New South", " Wales"]],
    ["its abbreviation", ["N", "SW"]],
    ["the AU host suffix", [".com", ".au"]],
    ["the AU privacy statute", ["Privacy Act", " 1988"]],
    ["the AU privacy regulator", ["OA", "IC"]],
    ["the NSW working-with-children check", ["WW", "CC"]],
    ["the NSW service brand", ["Service N", "SW"]],
    ["the AU employment regulator", ["Fair", " Work"]],
    ["the AU consumer statute", ["Australian Consumer", " Law"]],
    ["the AU business number", ["AB", "N"]],
    ["the AU dialling prefix", ["+", "61 412 345 678"]],
  ];

  it.each(FACTS)("LEGAL carries no %s", (_label, fragments) => {
    const needle = fragments.join("");
    for (const [path, value] of strings(LEGAL, "LEGAL"))
      expect(`${path}=${value}`).not.toContain(needle);
  });

  it.each(FACTS)(
    "the `jurisdiction` gate rule catches %s",
    (_label, fragments) => {
      expect(jurisdictionRule().pattern.test(fragments.join(""))).toBe(true);
    },
  );

  it("does not fire on the London tree's own comments about what did not travel", () => {
    // A bare city name is not a jurisdiction fact: ~40 London files say "Sydney's X is not carried", and a rule that
    // reddened those would be removed within a week. The spelled-out phrase is ordinary English in a UK sentence too.
    const { pattern } = jurisdictionRule();
    for (const benign of [
      "Sydney's rule is carried; the geography is not",
      "Years working with children",
      "no Australian mobile is accepted",
    ])
      expect(pattern.test(benign)).toBe(false);
  });
});
