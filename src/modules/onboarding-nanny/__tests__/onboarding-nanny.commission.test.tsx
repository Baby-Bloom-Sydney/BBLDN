// S-N-02 `/nanny/commission` (`03.37` NEW; 04 §4.4 c2 / c3; 04 §6.3 S-N-02) — the commission explainer and the
// book-a-call section, plus the two hub links that reach this page and S-N-01 (04 §4.4 c1). RED first.
//
// What the document forbids on this page is as load-bearing as what it asks for, so it is asserted directly:
// **no figures** until the money model sets them (D0.2), **no pay dashboard and no ledger** (N-2, ADR-022),
// **no bonus** (ADR-099 — the pitch is the briefing call), and **no call-me-later road** (ADR-073: she must
// pick a slot). An isolated nanny (S-N-22) reaches neither this page nor S-N-01 from her hub until she applies
// (ADR-147).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { configureAuth, stubAuth } from "@/modules/auth";
import { MATCHING } from "@/modules/config";
import type { E164, Email, ISO, ISODate, SlotId } from "@/modules/shared-types";
import {
  NannyCommissionPage,
  NannyHub,
  configureNannyAccountStore,
  loadCommissionPage,
  memoryNannyAccountStore,
  nannyHubView,
} from "@/modules/onboarding-nanny";
import type { NannyProfile, SlotDay } from "@/modules/onboarding-nanny";

const NANNY = "22222222-2222-4222-8222-222222222222";
const START = "2026-01-13T14:00:00.000Z" as ISO;
const MOBILE = "+447700900123" as E164; // config-literal-ok: a fixture's own number, not a config value

const DAYS: ReadonlyArray<SlotDay> = [
  {
    isoDate: "2026-01-13" as ISODate,
    legend: "Tuesday 13 January",
    slots: [
      {
        id: `default:${START}` as SlotId,
        start: START,
        end: START,
        time: "2:00pm",
        name: "Tuesday 13 January, 2:00pm London time",
      },
    ],
  },
];

const users = [
  {
    id: NANNY,
    email: "bea@example.test" as Email,
    password: "x".repeat(12),
    role: "nanny" as const,
  },
];

const ACTIONS = {
  subject: "nanny" as const,
  choose: vi.fn(async () => ({
    ok: true as const,
    value: { start: START, end: START },
  })),
  list: vi.fn(async () => ({ ok: true as const, value: DAYS })),
};

const profile = (over: Partial<NannyProfile> = {}): NannyProfile =>
  ({
    userId: NANNY,
    nannyId: "n-1",
    firstName: "Bea",
    lastName: "Lin",
    email: "bea@example.test",
    isIsolated: false,
    verificationLevel: "level_0",
    profileVisible: false,
    mobile: MOBILE,
    ...over,
  }) as NannyProfile;

let accounts: ReturnType<typeof memoryNannyAccountStore>;

beforeEach(async () => {
  configureAuth(stubAuth({ users, signedInUserId: NANNY }));
  accounts = memoryNannyAccountStore({
    emails: { [NANNY]: "bea@example.test" as Email },
  });
  configureNannyAccountStore(accounts);
  vi.clearAllMocks();
});

describe("loadCommissionPage — who the page is for", () => {
  it("sends a nanny with no party row away rather than rendering an empty pitch", async () => {
    const load = await loadCommissionPage();
    expect(load.kind).toBe("no-nanny");
  });

  it("answers `isolated` for an invited nanny — S-N-22 sees this page after she applies (ADR-147)", async () => {
    await accounts.create({
      userId: NANNY as never,
      firstName: "Bea",
      lastName: "Lin",
      isolated: true,
    });

    const load = await loadCommissionPage();

    expect(load.kind).toBe("isolated");
  });

  it("carries her first name, her mobile for the call, and the London days", async () => {
    await accounts.create({
      userId: NANNY as never,
      firstName: "Bea",
      lastName: "Lin",
      isolated: false,
      mobile: MOBILE,
    });

    const load = await loadCommissionPage({
      listSlots: async () => ({ ok: true as const, value: DAYS }),
      findBooking: async () => ({ ok: true as const, value: null }),
    });

    expect(load.kind).toBe("page");
    if (load.kind !== "page") return;
    expect(load.view.firstName).toBe("Bea");
    expect(load.view.mobile).toBe(MOBILE);
    expect(load.view.days).toEqual(DAYS);
    expect(load.view.chosen).toBeNull();
  });

  it("shows the time she already picked, so she is never offered a second call (I-10)", async () => {
    await accounts.create({
      userId: NANNY as never,
      firstName: "Bea",
      lastName: "Lin",
      isolated: false,
    });

    const load = await loadCommissionPage({
      listSlots: async () => ({ ok: true as const, value: DAYS }),
      findBooking: async () => ({
        ok: true as const,
        value: { start: START, end: START },
      }),
    });

    expect(load.kind === "page" && load.view.chosen?.start).toBe(START);
  });

  it("renders the page with no calendar rather than nothing when the read fails (L·E·E)", async () => {
    await accounts.create({
      userId: NANNY as never,
      firstName: "Bea",
      lastName: "Lin",
      isolated: false,
    });

    const load = await loadCommissionPage({
      listSlots: async () => ({
        ok: false as const,
        error: { code: "INTERNAL" as const, message: "no" },
      }),
      findBooking: async () => ({ ok: true as const, value: null }),
    });

    expect(load.kind === "page" && load.view.days).toBeNull();
  });
});

describe("NannyCommissionPage — the explainer (04 §4.4 c2)", () => {
  const view = {
    firstName: "Bea",
    mobile: MOBILE,
    days: DAYS,
    chosen: null,
  };

  it("explains it in plain terms and carries no figure at all (D0.2)", () => {
    render(
      <NannyCommissionPage
        view={view}
        actions={ACTIONS}
        hubHref="/nanny"
        addChildHref="/nanny/onboarding/add-child"
        brandName="TestBrand"
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "How commission works",
    );
    expect(document.body.textContent).not.toMatch(/£|\d+\s?%/); // config-literal-ok: the claim IS that no money symbol renders (D0.2)
  });

  it("offers no pay dashboard, no ledger and no bonus (N-2; ADR-099)", () => {
    render(
      <NannyCommissionPage
        view={view}
        actions={ACTIONS}
        hubHref="/nanny"
        addChildHref="/nanny/onboarding/add-child"
        brandName="TestBrand"
      />,
    );

    expect(document.body.textContent).not.toMatch(
      /bonus|payout|earnings|ledger|dashboard|affiliate/i,
    );
  });

  it("gives her the calendar and no 'call me later' road (ADR-073)", () => {
    render(
      <NannyCommissionPage
        view={view}
        actions={ACTIONS}
        hubHref="/nanny"
        addChildHref="/nanny/onboarding/add-child"
        brandName="TestBrand"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Book my call" }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/24 hours/i);
  });

  it("shows the mobile we will ring, so she can see it is the right one", () => {
    render(
      <NannyCommissionPage
        view={view}
        actions={ACTIONS}
        hubHref="/nanny"
        addChildHref="/nanny/onboarding/add-child"
        brandName="TestBrand"
      />,
    );

    expect(
      screen.getByText(new RegExp(MOBILE.replace("+", "\\+"))),
    ).toBeInTheDocument();
  });

  it("asks the one question the call needs: which families (04 §4.4 c3)", () => {
    render(
      <NannyCommissionPage
        view={view}
        actions={ACTIONS}
        hubHref="/nanny"
        addChildHref="/nanny/onboarding/add-child"
        brandName="TestBrand"
      />,
    );

    expect(
      screen.getByText("which families you would bring"),
    ).toBeInTheDocument();
  });

  it("shows the time she has in her own words (04 §8 anchor), and says it can move (ADR-074)", () => {
    render(
      <NannyCommissionPage
        view={{ ...view, chosen: { start: START, end: START } }}
        actions={ACTIONS}
        hubHref="/nanny"
        addChildHref="/nanny/onboarding/add-child"
        brandName="TestBrand"
      />,
    );

    expect(
      screen.getByText(
        "We'll call you Tuesday 13 January, 2:00pm London time.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/move you to the next one free/);
  });
});

describe("the hub's two new links (04 §4.4 c1; ADR-147)", () => {
  const hrefs = {
    applyHref: "/nanny/apply",
    verificationHref: "/nanny/onboarding-verification",
  };

  const hub = (over: Partial<NannyProfile>) =>
    render(
      <NannyHub
        view={nannyHubView(profile(over), MATCHING.minVerificationLevel, hrefs)}
        profileHref="/nanny/register"
        verificationHref="/nanny/onboarding-verification"
        settingsHref="/nanny/settings"
        childrenHref="/nanny/children"
        addChildHref="/nanny/onboarding/add-child"
        commissionHref="/nanny/commission"
      />,
    );

  it("offers both to a nanny who has applied", () => {
    hub({ isIsolated: false });

    expect(
      screen.getByRole("link", { name: /add a family/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /how commission works/i }),
    ).toBeInTheDocument();
  });

  it("offers neither to an isolated nanny — she sees them when she applies (S-N-22)", () => {
    hub({ isIsolated: true });

    expect(screen.queryByRole("link", { name: /add a family/i })).toBeNull();
    expect(
      screen.queryByRole("link", { name: /how commission works/i }),
    ).toBeNull();
  });
});
