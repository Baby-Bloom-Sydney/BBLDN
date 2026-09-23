// `unit.agreement-document-pairing` (L-009 `3m`) — `3b`'s Q-3, the half of it that is a fact.
//
// **The question.** "A surface pointed at the *wrong* seeded document passes every assertion. Both rows exist
// and both say draft, so the database can never judge the pairing." True of the database. Not true of the
// repo, whenever the pairing is written down **twice** — and on a consent surface it always is, because the
// document a person is *shown* and the document the consent row *records* are two statements about one thing.
// Where two declarations exist, agreement between them is a fact, and a fact is gateable.
//
// **This is not hypothetical.** `PolicyContent`'s map sent `parent-app-consent` to `/legal/client-terms`
// (`client-tos`) and `nanny-attestation` to `/legal/professional-terms` (`professional-tos`) — neighbouring
// documents, both seeded, both marked draft — while `purposeForAgreement` wrote the *other* one into the
// consent record. That is Q-3's exact shape, it was live, and the second declaration is what makes it
// visible. `3m` removed that map; this keeps the class shut.
//
// **What it checks.** Every file in `src/` that names an agreement id *and* a document id must agree with
// `purpose-for-agreement.ts`, which is the one declaration. The file list is computed, not typed, so a new
// recorder is picked up the day it lands. Two exemptions, each for a reason: `purpose-for-agreement.ts` is
// the declaration itself, and `media-consent-gate.ts` derives its two ids from it already — the shape this
// gate wants everything to converge on.
//
// **What it cannot check, and this is the honest half of the answer.** A pairing declared *once* — a page, or
// a recorder that names only a document — is not machine-checkable from inside the repo. Nothing here
// independently knows which document a given route or screen ought to show; the only other witness is the
// document's own `# ` heading, and judging a register title ("Legal and contact details") against a heading
// ("Legal and Contact Information") is a judgement about wording, not a fact. That residue stays with the
// person who commissions the text.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { CONSENT_PURPOSES } from "@/modules/platform";
import { purposeForAgreement } from "./purpose-for-agreement";
import type { AgreementId } from "./types";

const REPO = path.resolve(__dirname, "../../..");

/** Every label `purpose-for-agreement.ts` is total over (`src/lib/legal/types.ts`). */
const AGREEMENT_IDS: ReadonlyArray<AgreementId> = [
  "AGR-01",
  "AGR-02",
  "AGR-03",
  "AGR-04",
  "AGR-05",
  "AGR-06",
  "AGR-07",
  "AGR-08",
  "AGR-09",
  "AGR-10",
  "AGR-11",
  "AGR-12",
  "AGR-13",
  "AGR-14",
  "PARENT-APP-CONSENT",
  "NANNY-ATTESTATION",
];

const DOCUMENT_IDS = CONSENT_PURPOSES.filter((p) => p !== "vaccination-status");

const EXEMPT = new Set([
  // the one declaration this gate judges everything else against
  "src/lib/legal/purpose-for-agreement.ts",
  // already derives both of its ids from that declaration
  "src/lib/legal/media-consent-gate.ts",
]);

const quoted = (id: string): RegExp =>
  new RegExp(`["'\`]${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`);

function sourceFiles(): ReadonlyArray<string> {
  return execFileSync(
    "git",
    ["ls-files", "-z", "src/**/*.ts", "src/**/*.tsx"],
    {
      cwd: REPO,
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter((f) => f.length > 0 && !/\.(test|spec)\.tsx?$/.test(f));
}

type Naming = {
  readonly file: string;
  readonly agreements: ReadonlyArray<AgreementId>;
  readonly documents: ReadonlyArray<string>;
};

/** Code only: a header that explains a mis-pairing by quoting it is not a mis-pairing. */
const code = (file: string): string =>
  readFileSync(path.join(REPO, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

/**
 * Files that state one agreement and at least one document. **One** agreement, deliberately: the unit of this
 * gate is a file, so a file recording two different agreements gives no unambiguous pairing to judge and gets
 * no assertion rather than a guess. Every recorder in the tree today states one.
 */
function filesNamingBoth(): ReadonlyArray<Naming> {
  return sourceFiles()
    .filter((file) => !EXEMPT.has(file))
    .map((file) => {
      const text = code(file);
      return {
        file,
        agreements: AGREEMENT_IDS.filter((id) => quoted(id).test(text)),
        documents: DOCUMENT_IDS.filter((id) => quoted(id).test(text)),
      };
    })
    .filter((n) => n.agreements.length === 1 && n.documents.length > 0);
}

describe("unit.agreement-document-pairing — shown is recorded", () => {
  it("watches at least one recorder (a zero here means the gate has gone blind)", () => {
    expect(filesNamingBoth().length).toBeGreaterThan(0);
  });

  it("every file declaring both names the document its agreement maps to", () => {
    const disagreements = filesNamingBoth().flatMap((n) =>
      n.agreements
        .map((agreement) => ({
          file: n.file,
          agreement,
          declared: n.documents,
          mapped: purposeForAgreement(agreement)?.purpose ?? null,
        }))
        // `AGR-03` maps to no document by design (ADR-071); a file naming it and some
        // other document is not asserting a pairing about it.
        .filter((row) => row.mapped !== null)
        .filter((row) => !row.declared.includes(row.mapped as string)),
    );
    expect(disagreements).toEqual([]);
  });
});
