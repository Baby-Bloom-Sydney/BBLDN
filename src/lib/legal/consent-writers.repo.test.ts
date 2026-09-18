// **One road to a consent row** (L-009 `3g`, sub-tasks `3d` / `05.03` / `07.71`).
//
// This is the gate that makes the re-base stick. Everything `3g` fixed came from the same cause: a second road
// to a consent table that nobody was watching.
//
//   · `record-consent.ts` built `consent_records` rows itself, with a column the London table does not have and
//     no content hash — refused by the database since `0026`, silently, in every legacy clickwrap surface.
//   · `record-consent.ts` also held a **second** biometric recorder, which is the defect the fate table records
//     as stocktake 05 Q6 ("two consent mechanisms; the inline checkbox writes no record"). It had no caller and
//     would have been refused by `notice_content_hash NOT NULL` if it had.
//
// Both were invisible to review because the files that held them are not files a consent change touches. So the
// rule ships as a scan rather than as a paragraph: **a consent row is written by `platform/consent` and by
// nothing else**, and the connector's biometric road has exactly one caller.
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONSENT_PURPOSES } from "@/modules/platform";
import { listFiles } from "../../../scripts/ci/lib/list-files.mjs";

const REPO_ROOT = resolve(__dirname, "../../..");

/** The boot layer is the store — it is the implementation of the port, not a second road around it. */
const IS_THE_STORE = /^src\/boot\//;
const IS_ABOUT_THE_RULE = /\.test\.tsx?$/;

const sourceFiles = (): ReadonlyArray<string> =>
  (
    listFiles(resolve(REPO_ROOT, "src"), {
      extensions: [".ts", ".tsx"],
    }) as ReadonlyArray<string>
  ).map((file) => relative(REPO_ROOT, file));

function filesMatching(needle: RegExp): ReadonlyArray<string> {
  return sourceFiles().filter(
    (file) =>
      !IS_ABOUT_THE_RULE.test(file) &&
      !IS_THE_STORE.test(file) &&
      needle.test(readFileSync(resolve(REPO_ROOT, file), "utf8")),
  );
}

describe("consent writers — the three tables have one road each", () => {
  it("★ nothing outside the store writes `consent_records` directly", () => {
    expect(
      filesMatching(/from\(\s*["']consent_records["']\s*\)[\s\S]{0,80}insert/),
    ).toEqual([]);
  });

  it("★ nothing outside the store writes `biometric_consent_records` directly", () => {
    expect(
      filesMatching(
        /from\(\s*["']biometric_consent_records["']\s*\)[\s\S]{0,80}(insert|upsert)/,
      ),
    ).toEqual([]);
  });

  it("nothing outside the store writes `cookie_consent_records` directly", () => {
    expect(
      filesMatching(
        /from\(\s*["']cookie_consent_records["']\s*\)[\s\S]{0,80}insert/,
      ),
    ).toEqual([]);
  });
});

describe("consent writers — the biometric road has one caller (stocktake 05 Q6)", () => {
  it("★ `consent.recordBiometricConsent` is called from exactly one place", () => {
    const callers = filesMatching(/\brecordBiometricConsent\(/).filter(
      // The connector's own definition and its default delegation are the road, not callers of it.
      (file) => !file.startsWith("src/modules/platform/"),
    );

    expect(callers).toEqual([
      "src/modules/verification/lib/record-biometric-notice-consent.ts",
    ]);
  });

  it("★ that caller binds the notice's content hash, not merely its version (ADR-173; Art 9(2)(a))", () => {
    const source = readFileSync(
      resolve(
        REPO_ROOT,
        "src/modules/verification/lib/record-biometric-notice-consent.ts",
      ),
      "utf8",
    );

    expect(source).toContain("noticeContentHash: document.contentHash");
    // And the version it names is the registry's current one, not a literal — which is what makes `3a`'s
    // ratified text landing as version 2 a seed change and nothing else.
    expect(source).toContain('consent.getPolicy("biometric-notice")');
  });

  it("★ every document the agreement map names is a real registry purpose", () => {
    // The map is the one translation table between an app-level agreement label and a `legal_documents` slug.
    // A typo in it would not fail `tsc` if the type were widened, and would fail at the database instead — as
    // a `document-required` in front of a person, which is the worst place to find out.
    const map = readFileSync(
      resolve(REPO_ROOT, "src/lib/legal/purpose-for-agreement.ts"),
      "utf8",
    );
    const named = [...map.matchAll(/purpose: "([a-z0-9_-]+)"/g)].map(
      (match) => match[1],
    );

    expect(named.length).toBeGreaterThan(10);
    for (const purpose of named)
      expect(CONSENT_PURPOSES, purpose).toContain(purpose);
  });
});
