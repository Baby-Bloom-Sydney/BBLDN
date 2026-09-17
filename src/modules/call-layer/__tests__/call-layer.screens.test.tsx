// S-P-01 · S-P-02 · S-P-03 rendered (04 §6.2 semantics — fix: a11y-1 / a11y-2 / a11y-3 / a11y-4 / a11y-11):
// the heading and the level-2 promise; the variants; one radiogroup per day inside a fieldset with the full
// date as legend; option names in full with "London time"; tap = hold; the button = the write; a taken slot
// says so in an alert that takes focus; the empty and failed states still say the matchmaker will call; the
// rail is an `<ol>` with state text and `aria-current="step"`.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CallPage, ParentJourneyRail, SlotPicker } from "@/modules/call-layer";
import type { SlotActions, SlotDay } from "@/modules/call-layer";
import type {
  HoldId,
  ISO,
  ISODate,
  JourneyStep,
  PositionId,
  SlotId,
} from "@/modules/shared-types";

const POSITION = "p-1" as PositionId;
const START = "2026-01-13T14:00:00.000Z" as ISO;
const LATER = "2026-01-14T09:00:00.000Z" as ISO;

const day = (
  isoDate: string,
  legend: string,
  starts: ReadonlyArray<ISO>,
): SlotDay => ({
  isoDate: isoDate as ISODate,
  legend,
  slots: starts.map((start) => ({
    id: `default:${start}` as SlotId,
    start,
    end: start,
    time: start === START ? "2:00pm" : "9:00am",
    name: `${legend}, ${start === START ? "2:00pm" : "9:00am"} London time`,
  })),
});

const DAYS: ReadonlyArray<SlotDay> = [
  day("2026-01-13", "Tuesday 13 January", [START]),
  day("2026-01-14", "Wednesday 14 January", [LATER]),
];

const actionsWith = (overrides: Partial<SlotActions> = {}): SlotActions => ({
  hold: vi.fn(async () => ({
    ok: true as const,
    value: { holdId: "h-1" as HoldId },
  })),
  choose: vi.fn(async () => ({
    ok: true as const,
    value: { start: START, end: START },
  })),
  list: vi.fn(async () => ({ ok: true as const, value: DAYS })),
  ...overrides,
});

const taken = () => ({
  ok: false as const,
  error: {
    code: "CONFLICT" as const,
    message: "taken",
    details: { reason: "SLOT_TAKEN" },
  },
});

describe("SlotPicker (S-P-02)", () => {
  it("renders one radiogroup per day inside a fieldset whose legend is the full date, options named in full", () => {
    render(
      <SlotPicker
        positionId={POSITION}
        days={DAYS}
        actions={actionsWith()}
        dashboardHref="/parent"
      />,
    );

    expect(
      screen.getByRole("group", { name: "Tuesday 13 January" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", {
        name: "Tuesday 13 January, London time",
      }),
    ).toBeInTheDocument();
    const option = screen.getByRole("radio", {
      name: "Tuesday 13 January, 2:00pm London time",
    });
    expect(option).toBeInTheDocument();
    expect(screen.getByText("2:00pm").closest("time")).toHaveAttribute(
      "dateTime",
      START,
    );
    expect(screen.getByRole("button", { name: "Book my call" })).toBeDisabled();
  });

  it("holds on tap, then the button writes with the hold, and the chosen time is announced", async () => {
    const actions = actionsWith();
    render(
      <SlotPicker
        positionId={POSITION}
        days={DAYS}
        actions={actions}
        dashboardHref="/parent"
      />,
    );

    await userEvent.click(
      screen.getByRole("radio", {
        name: "Tuesday 13 January, 2:00pm London time",
      }),
    );
    await waitFor(() =>
      expect(actions.hold).toHaveBeenCalledWith(`default:${START}`, POSITION),
    );
    await userEvent.click(screen.getByRole("button", { name: "Book my call" }));

    await waitFor(() =>
      expect(actions.choose).toHaveBeenCalledWith({
        positionId: POSITION,
        slotId: `default:${START}`,
        holdId: "h-1",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Done — we'll call you Tuesday 13 January, 2:00pm London time.",
    );
    expect(
      screen.getByText(
        "We'll call you Tuesday 13 January, 2:00pm London time.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change time" }),
    ).toBeInTheDocument();
  });

  it("says a taken slot has gone, in an alert that takes focus, and marks the option unavailable", async () => {
    const actions = actionsWith({ hold: vi.fn(async () => taken()) });
    render(
      <SlotPicker
        positionId={POSITION}
        days={DAYS}
        actions={actions}
        dashboardHref="/parent"
      />,
    );

    await userEvent.click(
      screen.getByRole("radio", {
        name: "Tuesday 13 January, 2:00pm London time",
      }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That time has just gone — pick another.");
    expect(alert).toHaveFocus();
    expect(
      screen.getByRole("radio", {
        name: /2:00pm London time — no longer available/,
      }),
    ).toBeDisabled();
  });

  it("says the hold ran out when the write finds it expired", async () => {
    const actions = actionsWith({
      choose: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "CONFLICT" as const,
          message: "expired",
          details: { reason: "HOLD_EXPIRED" },
        },
      })),
    });
    render(
      <SlotPicker
        positionId={POSITION}
        days={DAYS}
        actions={actions}
        dashboardHref="/parent"
      />,
    );

    await userEvent.click(
      screen.getByRole("radio", {
        name: "Wednesday 14 January, 9:00am London time",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Book my call" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your hold ran out — pick again.",
    );
  });

  it("with no slots in the window still says the matchmaker will call, and can try again", async () => {
    const actions = actionsWith();
    render(
      <SlotPicker
        positionId={POSITION}
        days={[]}
        actions={actions}
        dashboardHref="/parent"
      />,
    );

    expect(
      screen.getByText(
        "No times to pick right now — your matchmaker will call you.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(actions.list).toHaveBeenCalled());
    expect(
      await screen.findByRole("group", { name: "Tuesday 13 January" }),
    ).toBeInTheDocument();
  });

  it("with the slots failed to load, says so and still says we will call", () => {
    render(
      <SlotPicker
        positionId={POSITION}
        days={null}
        actions={actionsWith()}
        dashboardHref="/parent"
      />,
    );
    expect(
      screen.getByText(
        "We couldn't load the times — your matchmaker will still call you.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the chosen time with Change time while slot-chosen, and opens the days on request", async () => {
    render(
      <SlotPicker
        positionId={POSITION}
        days={DAYS}
        chosen={{ start: START, end: START }}
        actions={actionsWith()}
        dashboardHref="/parent"
      />,
    );
    expect(
      screen.getByText(
        "We'll call you Tuesday 13 January, 2:00pm London time.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Change time" }));
    expect(
      screen.getByRole("group", { name: "Wednesday 14 January" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Keep my time" }),
    ).toBeInTheDocument();
  });
});

describe("CallPage (S-P-01)", () => {
  const view = {
    positionId: POSITION,
    state: "awaiting-slot" as const,
    variant: "matchmaking" as const,
  };

  it("carries the heading, the level-2 promise and the picker; no 24-hour option anywhere", () => {
    render(
      <CallPage
        view={view}
        days={DAYS}
        actions={actionsWith()}
        dashboardHref="/parent"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your matchmaker will call you. Pick a time.",
    );
    expect(
      screen.getByText(
        /Before we call, we'll check which of your top nannies are available and keen/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Book my call" }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/24 hours/i);
  });

  it("names the nanny after a self-serve Connect, says the app for an invite-arrived parent, and says we'll try again after a no-answer", () => {
    const { rerender } = render(
      <CallPage
        view={{ ...view, variant: "after-connect", aboutNanny: "Priya" }}
        days={DAYS}
        actions={actionsWith()}
        dashboardHref="/parent"
      />,
    );
    expect(
      screen.getByText("Your matchmaker will call you about Priya."),
    ).toBeInTheDocument();

    rerender(
      <CallPage
        view={{ ...view, variant: "onboarding", aboutNanny: "Priya" }}
        days={DAYS}
        actions={actionsWith()}
        dashboardHref="/parent"
      />,
    );
    expect(
      screen.getByText(
        "Your matchmaker will call you — we'll get you and Priya set up in the app.",
      ),
    ).toBeInTheDocument();

    rerender(
      <CallPage
        view={{ ...view, variant: "after-no-answer" }}
        days={DAYS}
        actions={actionsWith()}
        dashboardHref="/parent"
      />,
    );
    expect(
      screen.getByText(
        "We tried to reach you — pick a time and we'll try again.",
      ),
    ).toBeInTheDocument();
  });
});

describe("ParentJourneyRail (S-P-03; 04 §7.1)", () => {
  const steps: ReadonlyArray<JourneyStep> = [
    {
      row: 1,
      label: "Matches",
      state: "done",
      detail: "Matched — 5 top nannies",
    },
    {
      row: 2,
      label: "Nannies pre-checked",
      state: "in-motion",
      detail: "We're checking who's available and keen",
    },
    {
      row: 3,
      label: "Introduction call",
      state: "in-motion",
      detail: "Introduction call — pick a time",
    },
    { row: 4, label: "Meetings", state: "pending" },
    { row: 5, label: "Met", state: "hidden" },
    { row: 6, label: "Hire", state: "pending" },
    { row: 7, label: "Your app", state: "pending" },
  ];

  it("is an ordered list with state as text, aria-current on the in-motion step, hidden rows absent", () => {
    render(<ParentJourneyRail steps={steps} />);
    const items = screen.getAllByRole("listitem");
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveTextContent("Matches");
    expect(items[0]).toHaveTextContent("Done");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[2]).toHaveTextContent("Introduction call — pick a time");
    expect(items[3]).toHaveTextContent("Next");
    expect(screen.queryByText("Met")).not.toBeInTheDocument();
  });

  it("never shows an empty room: when the read failed the six labels still stand with the error line", () => {
    render(<ParentJourneyRail steps={[]} failed />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "We couldn't load where you are just now",
    );
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Introduction call"),
        expect.stringContaining("Your app"),
      ]),
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });
});
