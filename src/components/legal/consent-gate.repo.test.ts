// **The gate on the gate** (L-009 `3g`; ADR-175 (c)).
//
// `ConsentGate.test.tsx` proves that the component holds a script out of the document. It cannot prove the thing
// that actually protects a visitor, which is that **every** non-essential script goes through the component —
// and that is exactly how the defect this unit fixes got in: `<Analytics />` was added to `app/layout.tsx` at
// some point, ungated, and nothing anywhere was obliged to notice. A review note would not have caught it
// either, because the file it lives in is not a file a consent change touches.
//
// So the claim ships as a scan: the tracker packages are import-allow-listed to one file each, and that file is
// only ever mounted inside a `ConsentGate`. A new tracker added anywhere else fails here, in the suite named
// after the rule it breaks, rather than shipping green.
//
// **What is deliberately not in the list.** `JsonLd` renders an inline `application/ld+json` block: it stores
// nothing on the device, fetches nothing, and runs no code — PECR reg 6 is about storage and access, so it is
// not a consent question. It is named here rather than silently skipped, because "there is one exception and
// this is why" is the sentence a future reader needs.
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { listFiles } from "../../../scripts/ci/lib/list-files.mjs";

const REPO_ROOT = resolve(__dirname, "../../..");

/** Packages and hosts that load third-party code into a visitor's browser. Add to this list, never remove. */
const TRACKERS: ReadonlyArray<{
  readonly needle: string;
  readonly allowed: string;
}> = [
  {
    needle: "@vercel/analytics",
    allowed: "src/components/legal/AnalyticsScripts.tsx",
  },
  {
    needle: "@vercel/speed-insights",
    allowed: "src/components/legal/AnalyticsScripts.tsx",
  },
  {
    needle: "connect.facebook.net",
    allowed: "src/components/legal/AnalyticsScripts.tsx",
  },
  {
    needle: "googletagmanager.com",
    allowed: "src/components/legal/AnalyticsScripts.tsx",
  },
];

/**
 * Files that may carry a needle because they are *about* the rule rather than breaking it: the suites that
 * assert it, and `config/security.ts`, which holds 07 §10.3's CSP origin list. Naming the Meta host in the
 * allow-list is not loading it — 07 §10.3 is explicit that the allow-list is a ceiling on what *can* load and
 * is not what enforces PECR.
 */
const ABOUT_THE_RULE = /(\.test\.tsx?$|^src\/modules\/config\/security\.ts$)/;

const sourceFiles = (): ReadonlyArray<string> =>
  (
    listFiles(resolve(REPO_ROOT, "src"), {
      extensions: [".ts", ".tsx"],
    }) as ReadonlyArray<string>
  ).map((file) => relative(REPO_ROOT, file));

describe("consent gate — a tracker may be imported in exactly one place", () => {
  for (const tracker of TRACKERS) {
    it(`${tracker.needle} appears only in ${tracker.allowed}`, () => {
      const offenders = sourceFiles().filter((file) => {
        if (file === tracker.allowed) return false;
        if (ABOUT_THE_RULE.test(file)) return false;
        return readFileSync(resolve(REPO_ROOT, file), "utf8").includes(
          tracker.needle,
        );
      });
      expect(offenders).toEqual([]);
    });
  }
});

describe("consent gate — the one allowed file is mounted behind the gate", () => {
  const layout = () =>
    readFileSync(resolve(REPO_ROOT, "src/app/layout.tsx"), "utf8");

  it("★ the root layout mounts AnalyticsScripts inside a ConsentGate, not beside it", () => {
    const source = layout();
    expect(source).toContain('<ConsentGate category="analytics">');
    // The gate opens before the tracker and closes after it — a sibling would pass a bare `includes` check.
    const opens = source.indexOf('<ConsentGate category="analytics">');
    const tracker = source.indexOf("<AnalyticsScripts />");
    const closes = source.indexOf("</ConsentGate>");
    expect(opens).toBeGreaterThan(-1);
    expect(tracker).toBeGreaterThan(opens);
    expect(closes).toBeGreaterThan(tracker);
  });

  it("★ the tracker is not also mounted anywhere else", () => {
    const mounts = sourceFiles().filter(
      (file) =>
        !ABOUT_THE_RULE.test(file) &&
        file !== "src/components/legal/AnalyticsScripts.tsx" &&
        readFileSync(resolve(REPO_ROOT, file), "utf8").includes(
          "<AnalyticsScripts",
        ),
    );
    expect(mounts).toEqual(["src/app/layout.tsx"]);
  });
});

describe("consent gate — no other third-party script tag is rendered", () => {
  it("the only `<script` in the tree loads no third-party code (JsonLd's inline ld+json)", () => {
    const withScriptTags = sourceFiles().filter(
      (file) =>
        !ABOUT_THE_RULE.test(file) &&
        /<script[\s>]/.test(readFileSync(resolve(REPO_ROOT, file), "utf8")),
    );
    expect(withScriptTags).toEqual([
      "src/modules/public-site/components/JsonLd.tsx",
    ]);
  });

  it("nothing imports next/script, which would load a remote src outside the gate", () => {
    const importers = sourceFiles().filter(
      (file) =>
        !ABOUT_THE_RULE.test(file) &&
        readFileSync(resolve(REPO_ROOT, file), "utf8").includes("next/script"),
    );
    expect(importers).toEqual([]);
  });
});
