// The copy claim as an executable test (ADR-120 rule 1; ADR-124; 00-glossary §6). Every word a parent reads on
// this unit's surfaces is **generated** — by running the three pure views over every state they have — and then
// matched against `scripts/ci/banned-words.txt`. That is the rendered test in miniature: it reads the words
// themselves rather than the files they live in, so a reword cannot pass by moving a sentence.
//
// This surface is the one whose job is to say "not right now", which is where *free*, *upgrade* and *offer*
// are the obvious words to reach for. `tests/e2e/words/allowlist.ts` is read, not amended: nothing here needs
// an exception, and the suite asserts that too — a future line that needs one has to justify it in that file.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WORD_ALLOWLIST } from "../../../../tests/e2e/words/allowlist";
import type {
  ChildId,
  ISODate,
  Instant,
  InviteId,
} from "@/modules/shared-types";
import { appAccessView } from "../child-linking/lib/app-access-view";
import { childrenCardView } from "../child-linking/lib/children-card-view";
import { inviteLandingView } from "../child-linking/lib/invite-landing-view";
import type { AccessFacts } from "../child-linking/lib/app-access-view";
import type { ChildInvite, ChildRecord } from "../child-linking/types";

const WORD_LIST = resolve(__dirname, "../../../../scripts/ci/banned-words.txt");

const phrases = readFileSync(WORD_LIST, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

const pattern = new RegExp(
  `\\b(?:${phrases
    .map((phrase) =>
      phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[ -]"),
    )
    .join("|")})\\b`,
  "gi",
);

/** Every string in a view, however deep — the test must not be able to miss a branch by not knowing its shape. */
function stringsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, out);
  else if (value !== null && typeof value === "object")
    for (const [key, item] of Object.entries(value))
      // Addresses are not words a parent reads: `/parent/subscribe` is a URL, and the screens themselves never
      // say the word in it. Ids and tokens are excluded for the same reason — neither is prose.
      if (!["href", "url", "shareUrl", "childId", "id"].includes(key))
        stringsIn(item, out);
  return out;
}

const AT = "2026-09-17T09:00:00.000Z" as Instant;

const child = (name: string): ChildRecord => ({
  id: "c1" as ChildId,
  firstName: name,
  dateOfBirth: "2025-01-15" as ISODate,
  parentUserId: null,
  createdAt: AT,
});

const invite: ChildInvite = {
  id: "i1" as InviteId,
  childId: "c1" as ChildId,
  token: "ABCD-EFGH",
  direction: "parent_to_nanny",
  status: "pending",
  createdAt: AT,
  url: "https://example.test/invite/ABCD-EFGH",
};

/** Every gate answer there is: the nine standings collapse to `open`, the two closed reasons, and unknown. */
const EVERY_ACCESS: ReadonlyArray<AccessFacts | null> = [
  null,
  { open: true, reason: "trial" },
  { open: true, reason: "placed" },
  { open: true, reason: "active" },
  { open: true, reason: "paid-in-full" },
  { open: true, reason: "toggled-on" },
  { open: false, reason: "none" },
  { open: false, reason: "deposit-paid" },
  { open: false, reason: "lapsed" },
  { open: false, reason: "access-ended" },
  { open: false, reason: "toggled-off" },
];

function everyWord(): ReadonlyArray<string> {
  const words: string[] = [];

  for (const access of EVERY_ACCESS) {
    words.push(...stringsIn(appAccessView({ access, children: [] })));
    for (const children of [
      [],
      [child("Amara")],
      [child("Amara"), child("Bo")],
    ])
      for (const invites of [[], [invite]])
        for (const linkedChildIds of [[], ["c1"]])
          words.push(
            ...stringsIn(
              childrenCardView({ access, children, invites, linkedChildIds }),
            ),
          );
  }

  for (const direction of ["nanny_to_parent", "parent_to_nanny"] as const)
    for (const viewerRole of [null, "parent", "nanny", "admin"] as const)
      words.push(
        ...stringsIn(
          inviteLandingView({
            preview: { childFirstName: "Amara", direction, invitedBy: "Priya" },
            viewerRole,
            tokenWasMalformed: false,
            lookupFailed: false,
            signUpHref: "/signup",
            signInHref: "/login",
          }),
        ),
      );

  for (const [malformed, failed, preview] of [
    [true, false, null],
    [false, true, null],
    [false, false, null],
  ] as const)
    words.push(
      ...stringsIn(
        inviteLandingView({
          preview,
          viewerRole: null,
          tokenWasMalformed: malformed,
          lookupFailed: failed,
          signUpHref: "/signup",
          signInHref: "/login",
        }),
      ),
    );

  return words;
}

describe("every word a parent reads on S-X-13, S-P-14 and S-P-13 (ADR-124)", () => {
  it("generates a real corpus rather than checking an empty one", () => {
    expect(everyWord().length).toBeGreaterThan(60);
  });

  it("carries no banned word, in any state, with no allowlist row", () => {
    const offenders = everyWord()
      .flatMap((line) => (line.match(pattern) ?? []).map((hit) => [line, hit]))
      .map(([line, hit]) => `"${hit}" in: ${line}`);

    expect(offenders).toEqual([]);
  });

  it("never frames a lapse as a trial ending, and never counts days down at the family", () => {
    // 04 §3's carried ruling + the standing memory rule: no in-app countdown, and the paywall says what the
    // family gets rather than what has run out. A day count would show up as a digit beside "day".
    for (const line of everyWord()) {
      expect(line.toLowerCase()).not.toContain("trial has ended");
      expect(line.toLowerCase()).not.toContain("your trial");
      expect(line).not.toMatch(/\b\d+\s*days?\b/i);
    }
  });

  it("needs no allowlist row of its own — the file is read, not amended", () => {
    const mine = WORD_ALLOWLIST.filter((row) =>
      ["S-X-13", "S-P-13", "S-P-14", "S-N-20"].includes(row.screen),
    );

    expect(mine).toEqual([]);
  });
});

describe("the paywall's guide voice (04 §8)", () => {
  it("says what the family gets, and names the promise ADR-083 / 084 sold them", () => {
    const view = appAccessView({
      access: { open: false, reason: "lapsed" },
      children: [],
    });

    expect(view.kind).toBe("closed");
    expect(view.kind === "closed" && view.body).toContain(
      "until your youngest",
    );
    expect(view.kind === "closed" && view.body).toContain(
      "every child you have after that",
    );
  });

  it("★ an admin's off-toggle is NOT a paywall — the family is told to ask their matchmaker (ADR-093)", () => {
    const view = appAccessView({
      access: { open: false, reason: "toggled-off" },
      children: [],
    });

    expect(view.kind === "closed" && view.action.href).toBe("/contact");
  });
});
