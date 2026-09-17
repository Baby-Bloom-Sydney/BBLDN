// S-X-02 · S-X-03 · S-X-04 as executable claims (04 §6.1 states; 04 §3.1 steps 2–4; 04 §8): the count line and
// three cards with the DBS badge; the no-match line is a stop state whose heading takes focus; error carries a
// retry; the CTA routes to signup, never a guest Connect (B.2), while a card's Connect posts to the one entry
// point; S-X-04 shows three cards, blurs the fourth behind "+N more, sign up to see all", and links S-X-05 with
// the lead; the wizard numbers "question n of N" in the h1, marks the current step, moves focus to each new
// heading, saves after every answer, prefills, and shows the ratified T-1.8d header when a Connect brought
// the parent in.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchCard, ParentLead, PublicNanny } from "@/modules/matching";
import {
  AGE_LABELS,
  PreAuthResults,
  QuickMatchResults,
  WIZARD_QUESTIONS,
  Wizard,
} from "@/modules/matching";
import type { LeadId, NannyId } from "@/modules/shared-types";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const NANNY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as NannyId;
const LEAD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as LeadId;
const connectAction = vi.fn(async () => undefined as never);

const nanny = (id: string, over: Partial<PublicNanny> = {}): PublicNanny => ({
  nannyId: id as NannyId,
  firstName: "Amara",
  area: { area: "Clapham", district: "SW4" },
  photoUrl: null,
  bio: "Early-years nanny who loves a routine.",
  yearsExperience: 4,
  qualification: "Level 3 childcare",
  certificates: [],
  languages: [],
  hasCar: false,
  hasDrivingLicence: true,
  isNonSmoker: true,
  comfortableWithPets: null,
  availability: [],
  availableFrom: null,
  verificationLevel: "L3_PROVISIONALLY_VERIFIED",
  ...over,
});

const card = (id: string, score: number): MatchCard => ({
  nanny: nanny(id),
  ranked: {
    nannyId: id as NannyId,
    score,
    layers: { base: 1, penalty: 1, bonus: 1 },
    distanceKm: 2,
    scheduleOverlapPct: 100,
    unmet: [],
    bonuses: [],
  },
});

const AREA = { area: "Clapham", district: "SW4" };

beforeEach(() => {
  push.mockReset();
  connectAction.mockReset();
});

describe("S-X-02 — QuickMatchResults", () => {
  it("shows the count line, three cards with the DBS badge, signup as the CTA and a Connect per card", () => {
    render(
      <QuickMatchResults
        page={{
          kind: "matches",
          area: AREA,
          total: 7,
          cards: [card(NANNY_A, 91), card("b", 80), card("c", 70)],
        }}
        connectAction={connectAction}
        serviceAreaName="Somewhere"
        retryHref="/results"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "7 nannies near Clapham, SW4",
    );
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getAllByText("DBS")).toHaveLength(3);
    expect(
      screen.getByRole("link", { name: "Connect with best matches" }),
    ).toHaveAttribute("href", "/signup?src=std");
    expect(screen.getAllByRole("button", { name: "Connect" })).toHaveLength(3);
    expect(
      screen.getAllByRole("link", { name: "See Amara's profile" })[0],
    ).toHaveAttribute("href", `/nannies/${NANNY_A}?src=std`);
    expect(screen.getByText("91% match")).toBeInTheDocument();
  });

  it("no-match is a stop state: the service-area line, its heading takes focus, one way forward", () => {
    render(
      <QuickMatchResults
        page={{ kind: "no-match", area: AREA }}
        connectAction={connectAction}
        serviceAreaName="Somewhere"
        retryHref="/results"
      />,
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(
      "We cover Somewhere — nannies near you are being added",
    );
    expect(heading).toHaveFocus();
    expect(
      screen.getByRole("link", { name: "Tell us about your family" }),
    ).toHaveAttribute("href", "/matchmaking/onboarding");
  });

  it("error carries a retry control and is announced", () => {
    render(
      <QuickMatchResults
        page={{ kind: "error" }}
        connectAction={connectAction}
        serviceAreaName="Somewhere"
        retryHref="/results?district=SW4"
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/results?district=SW4",
    );
  });
});

describe("S-X-04 — PreAuthResults", () => {
  const lead: ParentLead = {
    id: LEAD,
    answers: { area: AREA },
    area: AREA,
    source: "adv",
    completed: true,
    claimed: false,
  };

  it("shows three cards, blurs the fourth behind '+N more', and links S-X-05 with the lead", () => {
    render(
      <PreAuthResults
        page={{
          kind: "matches",
          lead,
          total: 9,
          cards: [card("a", 95), card("b", 90), card("c", 85), card("d", 80)],
        }}
        connectAction={connectAction}
        retryHref="/matchmaking/results"
      />,
    );
    expect(screen.getByText("9 nannies matched")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("+6 more")).toBeInTheDocument();
    expect(
      screen.getByText("Sign up to see all your matches."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Connect with best matches" }),
    ).toHaveAttribute("href", `/matchmaking/signup?lead=${LEAD}`);
  });
});

describe("S-X-03 — Wizard", () => {
  const saveAction = vi.fn(async () => ({
    ok: true as const,
    value: undefined,
  }));

  beforeEach(() => saveAction.mockClear());

  it("numbers the question in the h1, marks the current step, moves focus to the heading", () => {
    render(
      <Wizard
        questions={WIZARD_QUESTIONS}
        ageLabels={AGE_LABELS}
        initialAnswers={{}}
        leadId={LEAD}
        source={null}
        connectNannyId={null}
        saveAction={saveAction}
      />,
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(
      `Question 1 of ${WIZARD_QUESTIONS.length}`,
    );
    expect(heading).toHaveFocus();
    const steps = screen.getByRole("list", { name: "Your questions" });
    expect(steps.querySelectorAll("[aria-current='step']")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("saves after every answer, advances, and prefills from the quick match", async () => {
    render(
      <Wizard
        questions={WIZARD_QUESTIONS}
        ageLabels={AGE_LABELS}
        initialAnswers={{ area: AREA, days: [0], parts: ["morning"] }}
        leadId={LEAD}
        source="std"
        connectNannyId={null}
        saveAction={saveAction}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "1" }));
    fireEvent.click(screen.getByRole("radio", { name: "1–2 years" }));
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(2));
    expect(saveAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        leadId: LEAD,
        source: "std",
        completed: false,
        answers: expect.objectContaining({
          area: AREA,
          days: [0],
          children: [{ ageLabel: "1–2 years" }],
        }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Question 2 of",
    );
    expect(screen.getByRole("combobox")).toHaveValue("Clapham, SW4");
  });

  it("shows the ratified T-1.8d header when a guest Connect brought the parent here", () => {
    render(
      <Wizard
        questions={WIZARD_QUESTIONS}
        ageLabels={AGE_LABELS}
        initialAnswers={{}}
        leadId={LEAD}
        source={null}
        connectNannyId={NANNY_A}
        saveAction={saveAction}
      />,
    );
    expect(
      screen.getByText("Create your position to connect with nannies"),
    ).toBeInTheDocument();
  });

  it("on the last answer saves as completed and goes to S-X-04 with the lead; a failed final save shows retry", async () => {
    const yesNo = WIZARD_QUESTIONS.filter((q) => q.kind === "yes-no").length;
    const last = WIZARD_QUESTIONS.at(-1);
    const oneQuestion = last === undefined ? [] : [last];
    const failing = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "INTERNAL", message: "x", details: {} },
      })
      .mockResolvedValue({ ok: true, value: undefined });
    render(
      <Wizard
        questions={oneQuestion}
        ageLabels={AGE_LABELS}
        initialAnswers={{}}
        leadId={LEAD}
        source={null}
        connectNannyId={null}
        saveAction={failing}
      />,
    );
    expect(yesNo).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "See my matches" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "We couldn't save your answers",
      ),
    );
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/matchmaking/results?lead=${LEAD}`),
    );
    expect(failing).toHaveBeenLastCalledWith(
      expect.objectContaining({ completed: true }),
    );
  });
});
