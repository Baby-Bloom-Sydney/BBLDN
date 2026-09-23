// `unit.legal-pages` — the three claims L-009 `3b`'s merge rests on (kickoff §6 rule 1).
//
//   1. **No page serves a Sydney body.** Static, over every file under `src/app/(public)/legal/`: none of them
//      contains the jurisdiction, the entity, the regulator or the domain of the platform these pages were
//      copied from, and none of them is large enough to be carrying a policy at all. This is the assertion that
//      actually protects the promise — a rendered-output test only proves the page it renders, while this one
//      fails the day anybody pastes a body back in, on any of the seven routes at once.
//   2. **The draft marking reaches the reader.** A body carrying `0026`'s marking renders a banner above the
//      title, not only the bold line three paragraphs down that the body itself carries.
//   3. **A missing document is a refusal.** No row, no body, an unmapped path or a failed read renders "not
//      published" — never text compiled into the page, which is how the Sydney bodies survived this long.
//
// The fourth claim — that each of the seven routes has a *seeded* row and that the row says it is a draft —
// needs the applied database and lives in `supabase/__tests__/legal-pages-documents.test.ts`.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalDocument } from "./LegalDocument";
import { DRAFT_MARKING } from "@/lib/legal/draft-marking";
import { LEGAL_PAGE_DOCUMENTS } from "@/lib/legal/legal-page-documents";
import { URLS } from "@/modules/config";
import { PUBLIC_ROUTES } from "@/modules/public-site";
import type { LegalDocumentBody } from "@/lib/legal/fetch-legal-document";

const LEGAL_PAGES_DIR = join(process.cwd(), "src/app/(public)/legal");

/**
 * Words that only appear in a body written for the Sydney platform. Jurisdiction, statute, regulator id,
 * entity and domain — five independent ways of being the wrong document, so a body cannot be laundered past
 * this list by editing one of them.
 */
const SYDNEY_MARKERS = [
  "Sydney",
  "NSW",
  "New South Wales",
  "Privacy Act 1988",
  "Australian Privacy Principles",
  "ABN",
  "babybloomsydney",
  ".com.au",
] as const;

/** A page that renders a row is ~20 lines. A page carrying a policy is 600+. 80 is not a close call. */
const MAX_PAGE_LINES = 80;

function legalPageFiles(): ReadonlyArray<string> {
  const walk = (dir: string): ReadonlyArray<string> =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  return walk(LEGAL_PAGES_DIR);
}

const draft: LegalDocumentBody = {
  id: "client-tos",
  version: 1,
  effectiveDate: "2026-09-19",
  bodyMd: [
    "# Client Terms of Service",
    "",
    `**${DRAFT_MARKING}.**`,
    "",
    "This document has no ratified text.",
  ].join("\n"),
};

describe("unit.legal-pages — no page serves a Sydney body (L-009 `3b`)", () => {
  const files = legalPageFiles();

  it("finds the seven routes and the layout, and nothing else", () => {
    expect(files.length).toBe(Object.keys(LEGAL_PAGE_DOCUMENTS).length + 1);
  });

  it.each(files)("%s carries no Sydney marker", (file) => {
    const source = readFileSync(file, "utf8");
    for (const marker of SYDNEY_MARKERS) expect(source).not.toContain(marker);
  });

  it.each(files)("%s is too small to be carrying a policy", (file) => {
    expect(readFileSync(file, "utf8").split("\n").length).toBeLessThan(
      MAX_PAGE_LINES,
    );
  });

  it("no longer has a client biometric-notice route (ADR-071)", () => {
    expect(files.some((file) => file.includes("biometric-notice-client"))).toBe(
      false,
    );
  });
});

// The check a `URLS` import into `legal-page-documents.ts` would have bought, made explicit so that file can
// stay free of `config` and be readable from the environment-less integration project.
describe("unit.legal-pages — every mapped segment is a live registered route", () => {
  const segments = Object.keys(LEGAL_PAGE_DOCUMENTS);

  it.each(segments)("/legal/%s has a page file", (segment) => {
    expect(existsSync(join(LEGAL_PAGES_DIR, segment, "page.tsx"))).toBe(true);
  });

  it.each(segments)("/legal/%s has a register row (04 §2.1)", (segment) => {
    expect(
      PUBLIC_ROUTES.some((route) => route.path === `/legal/${segment}`),
    ).toBe(true);
  });

  it.each(segments)("/legal/%s is a path `config` knows (L4)", (segment) => {
    expect(Object.values(URLS.paths.legal)).toContain(`/legal/${segment}`);
  });

  it("maps every legal path `config` publishes, and no more", () => {
    expect(segments.length).toBe(Object.keys(URLS.paths.legal).length);
  });

  // A page pointed at the *wrong* seeded document passes every database assertion — both rows exist and both
  // say draft. Uniqueness catches the common half of that mistake (two pages reading one document); a clean
  // swap of two ids is not machine-checkable and is recorded in L-009 PROGRESS as reviewed by eye.
  it("points each page at a document of its own", () => {
    const ids = Object.values(LEGAL_PAGE_DOCUMENTS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves no register row pointing at a route that is gone", () => {
    const orphans = PUBLIC_ROUTES.filter(
      (route) =>
        route.path.startsWith("/legal/") &&
        !segments.includes(route.path.slice("/legal/".length)),
    );
    expect(orphans).toEqual([]);
  });
});

describe("unit.legal-pages — the draft marking reaches the reader (kickoff §3)", () => {
  it("renders the marking as a note above the document title", () => {
    render(<LegalDocument document={draft} fallbackTitle="Client terms" />);

    const note = screen.getByRole("note");
    expect(note.textContent).toContain(DRAFT_MARKING);
    expect(
      note.compareDocumentPosition(screen.getByRole("heading", { level: 1 })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("titles the page from the body's own heading, and renders the body", () => {
    render(<LegalDocument document={draft} fallbackTitle="Client terms" />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Client Terms of Service",
    );
    expect(screen.getByText(/has no ratified text/)).toBeTruthy();
  });

  it("raises no banner once the body no longer says it is a draft", () => {
    render(
      <LegalDocument
        document={{
          ...draft,
          version: 2,
          bodyMd: "# Client Terms\n\nRatified.",
        }}
        fallbackTitle="Client terms"
      />,
    );

    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("unit.legal-pages — a missing document is a refusal (fail closed)", () => {
  it("says the document is not published and shows no body in its place", () => {
    render(<LegalDocument document={null} fallbackTitle="Client terms" />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Client terms",
    );
    expect(screen.getByText(/has not been published yet/)).toBeTruthy();
    expect(screen.queryByText(/Version/)).toBeNull();
  });
});
