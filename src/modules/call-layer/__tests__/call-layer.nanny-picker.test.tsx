// S-P-02 rendered as S-N-02's picker (`2g`; 04 §6.2 "component, reused on S-N-02 / S-N-13 / S-N-14 / S-A-04").
// The claim is that the reuse is real: the same component, the same ARIA, the same London words — and the two
// behaviours the nanny's surface differs by, both of them the contract's (03 §3.2): her tap **holds nothing**,
// and her confirm carries no position. RED first.
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SlotPicker } from "@/modules/call-layer";
import type { SlotActions, SlotDay } from "@/modules/call-layer";
import type { ISO, SlotId } from "@/modules/shared-types";

const START = "2026-01-13T14:00:00.000Z" as ISO;

const DAYS: ReadonlyArray<SlotDay> = [
  {
    isoDate: "2026-01-13" as never,
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

type NannyActions = Extract<SlotActions, { readonly subject: "nanny" }>;

const nannyActions = (over: Partial<NannyActions> = {}): NannyActions => ({
  subject: "nanny",
  choose: vi.fn(async () => ({
    ok: true as const,
    value: { start: START, end: START },
  })),
  list: vi.fn(async () => ({ ok: true as const, value: DAYS })),
  ...over,
});

describe("SlotPicker on S-N-02 — the same component, the nanny's two differences", () => {
  it("picks and confirms with no hold and no position (03 §3.2)", async () => {
    const actions = nannyActions();
    render(
      <SlotPicker
        days={DAYS}
        actions={actions}
        dashboardHref="/nanny"
        copy={{ backLabel: "Back to your hub" }}
      />,
    );

    await userEvent.click(
      screen.getByRole("radio", {
        name: "Tuesday 13 January, 2:00pm London time",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Book my call" }));

    await waitFor(() =>
      expect(actions.choose).toHaveBeenCalledWith({
        slotId: `default:${START}`,
      }),
    );
    expect(
      screen.getByText(
        "We'll call you Tuesday 13 January, 2:00pm London time.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to your hub" }),
    ).toBeInTheDocument();
  });

  it("keeps S-P-02's semantics: one radiogroup per day, London time in every name", () => {
    render(
      <SlotPicker
        days={DAYS}
        actions={nannyActions()}
        dashboardHref="/nanny"
      />,
    );

    const group = screen.getByRole("radiogroup");
    expect(group).toHaveAccessibleName("Tuesday 13 January, London time");
    expect(
      screen.getByRole("radio", {
        name: "Tuesday 13 January, 2:00pm London time",
      }),
    ).toBeInTheDocument();
  });

  it("says who will call when there are no times — in her words, not the parent's", () => {
    render(
      <SlotPicker
        days={[]}
        actions={nannyActions()}
        dashboardHref="/nanny"
        copy={{ noSlotsLine: "No times free right now — try again shortly." }}
      />,
    );

    expect(
      screen.getByText("No times free right now — try again shortly."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/matchmaker/i);
  });

  it("a refused write leaves her on the calendar with a line she can act on", async () => {
    const actions = nannyActions({
      choose: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "CONFLICT" as const,
          message: "no",
          details: { reason: "SLOT_TAKEN" as const },
        },
      })),
    });
    render(<SlotPicker days={DAYS} actions={actions} dashboardHref="/nanny" />);

    await userEvent.click(
      screen.getByRole("radio", {
        name: "Tuesday 13 January, 2:00pm London time",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Book my call" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That time has just gone — pick another.",
      ),
    );
  });
});
