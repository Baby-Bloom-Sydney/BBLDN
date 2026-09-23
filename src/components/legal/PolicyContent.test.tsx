// `unit.policy-content` (L-009 `3m`) — a consent surface must be able to show the document being consented to.
//
// The defect this pins: `PolicyContent` used to turn a **document id** into a **page route** —
// `SLUG_TO_LEGAL_PAGE[slug] ?? \`/legal/${slug}\`` — a two-entry map over an eleven-member domain with a guess
// underneath it. Measured against `next dev` on the applied stack, the guess resolves for only four of the
// eleven seeded ids; five of the eleven answer **404** (`client-tos`, `professional-tos`, `cookie-policy`,
// `media-consent`, `agr14_nanny_child_add`). A "View policy" link beside a consent checkbox that 404s is not a
// broken link — it is a consent nobody can claim was informed.
//
// The fix is to stop deriving a route from a document id. `PolicyModal` reads the row **by its id**, so there
// is no second domain to get wrong and no seventh route to be missing. These cases assert the mechanism, not
// the wording: every one of the eleven ids renders, opens, and reaches the reader with that exact id.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LegalDocumentId } from "@/modules/platform";

const getPolicyMarkdown = vi.fn();

vi.mock("@/lib/actions/legal/get-policy", () => ({
  getPolicyMarkdown: (slug: string) => getPolicyMarkdown(slug),
}));

import { PolicyContent } from "./PolicyContent";

/** 02 §4.1's day-one slugs, all eleven — the domain `PolicyContent` is handed. */
const DOCUMENT_IDS: ReadonlyArray<LegalDocumentId> = [
  "client-tos",
  "professional-tos",
  "privacy-policy",
  "biometric-notice",
  "code-of-conduct",
  "cookie-policy",
  "disclaimer",
  "parent-app-consent",
  "nanny-attestation",
  "media-consent",
  "agr14_nanny_child_add",
];

beforeEach(() => {
  getPolicyMarkdown.mockReset();
  getPolicyMarkdown.mockResolvedValue({
    body_md: "# A Document\n\nBody text.",
    version: 1,
    effective_date: "2026-09-19",
  });
});

afterEach(cleanup);

describe("unit.policy-content — no document id is turned into a page route", () => {
  it.each(DOCUMENT_IDS)("%s renders no /legal/ link", (id) => {
    render(<PolicyContent slug={id} />);
    const links = screen.queryAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([]);
  });

  it.each(DOCUMENT_IDS)("%s reaches the reader with its own id", async (id) => {
    const user = userEvent.setup();
    render(<PolicyContent slug={id} />);
    await user.click(screen.getByRole("button", { name: /view policy/i }));
    expect(getPolicyMarkdown).toHaveBeenCalledWith(id);
  });

  it("shows the document body, not a link to somewhere it might live", async () => {
    const user = userEvent.setup();
    getPolicyMarkdown.mockResolvedValue({
      body_md: "# Photograph and Media Consent\n\nWhat is recorded.",
      version: 1,
      effective_date: "2026-09-19",
    });
    render(<PolicyContent slug="media-consent" />);
    await user.click(screen.getByRole("button", { name: /view policy/i }));
    expect(await screen.findByText(/What is recorded\./)).toBeInTheDocument();
  });

  it("fails closed when the document cannot be read", async () => {
    const user = userEvent.setup();
    getPolicyMarkdown.mockResolvedValue(null);
    render(<PolicyContent slug="media-consent" />);
    await user.click(screen.getByRole("button", { name: /view policy/i }));
    expect(await screen.findByText(/unavailable/i)).toBeInTheDocument();
  });
});
