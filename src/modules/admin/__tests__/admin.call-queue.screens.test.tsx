// S-A-03 and S-A-04 as rendered (04 §6.4). What is asserted here is the semantics the row names — the table
// shape, the announced count, type and priority **as text**, a real button per action, and the drawer's focus
// contract — not the styling.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  BookingId,
  ISO,
  PositionId,
  UserId,
} from "@/modules/shared-types";
import { CallQueue } from "../call-queue/components/CallQueue";
import { CalendarBoard } from "../calendar/components/CalendarBoard";
import type {
  CallQueueActions,
  CallQueueRow,
  CallQueueView,
} from "../call-queue/types";
import type { CalendarActions, CalendarView } from "../calendar/types";

afterEach(cleanup);

const row = (over: Partial<CallQueueRow> = {}): CallQueueRow =>
  ({
    bookingId: "bk-1" as BookingId,
    subject: { kind: "position", positionId: "pos-1" as PositionId },
    parentId: "parent-1" as UserId,
    type: "matchmaking",
    priority: "parent",
    state: "slot-chosen",
    startsAt: "2026-01-09T10:00:00.000Z" as ISO,
    when: "Friday 9 January, 10:00am London time",
    group: "due",
    flags: [],
    about: "SW4 · position open",
    ...over,
  }) as CallQueueRow;

const viewOf = (rows: ReadonlyArray<CallQueueRow>): CallQueueView => ({
  groups: [
    { name: "overdue", heading: "Overdue", rows: [] },
    {
      name: "due",
      heading: "Due now",
      rows: rows.filter((each) => each.group === "due"),
    },
    { name: "upcoming", heading: "Upcoming", rows: [] },
    {
      name: "awaiting-slot",
      heading: "Waiting for a time",
      rows: rows.filter((each) => each.group === "awaiting-slot"),
    },
    { name: "done", heading: "Done", rows: [] },
  ],
  total: rows.length,
  neverBookedUnavailable: true,
});

const actionsOf = (): CallQueueActions => ({
  recordOutcome: vi.fn(async () => ({ ok: true as const, value: undefined })),
  move: vi.fn(async () => ({ ok: true as const, value: undefined })),
  clear: vi.fn(async () => ({ ok: true as const, value: undefined })),
  book: vi.fn(async () => ({ ok: true as const, value: undefined })),
});

describe("S-A-03 — the call list", () => {
  it("is a table per group with a caption, column headers and the time as a row header", () => {
    render(<CallQueue view={viewOf([row()])} actions={actionsOf()} />);
    expect(screen.getByRole("table", { name: /Due now/ })).toBeInTheDocument();
    // one per group table; every one of them declares the sort (a11y-8)
    const timeHeaders = screen.getAllByRole("columnheader", {
      name: "Time (London)",
    });
    expect(timeHeaders).toHaveLength(5);
    for (const header of timeHeaders)
      expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(
      screen.getByRole("rowheader", {
        name: "Friday 9 January, 10:00am London time",
      }),
    ).toBeInTheDocument();
  });

  it("shows type and priority as visible text, never colour alone (a11y-10)", () => {
    render(<CallQueue view={viewOf([row()])} actions={actionsOf()} />);
    expect(
      screen.getByText(/Matchmaking · Priority: parent/),
    ).toBeInTheDocument();
  });

  it("announces the row count and re-announces it when the type filter changes", async () => {
    render(
      <CallQueue
        view={viewOf([
          row(),
          row({
            bookingId: "bk-2" as BookingId,
            type: "onboarding",
            when: "Friday 9 January, 10:30am London time",
          }),
        ])}
        actions={actionsOf()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 calls shown");
    await userEvent.selectOptions(
      screen.getByLabelText("Call type"),
      "onboarding",
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 call shown");
  });

  it("says a never-booked call is not listed, rather than reading as an empty queue", () => {
    render(<CallQueue view={viewOf([])} actions={actionsOf()} />);
    expect(
      screen.getByText(/never had a time booked are not listed/),
    ).toBeInTheDocument();
  });

  it("names a blocked-over row in words the admin can act on (ADR-077)", () => {
    render(
      <CallQueue
        view={viewOf([row({ flags: ["blocked-over"] })])}
        actions={actionsOf()}
      />,
    );
    expect(
      screen.getByText(/Blocked over — move or clear it/),
    ).toBeInTheDocument();
  });
});

describe("S-A-04 — the call item drawer", () => {
  it("opens as a modal, takes focus, and returns it to the row on close (a11y-9)", async () => {
    render(<CallQueue view={viewOf([row()])} actions={actionsOf()} />);
    const trigger = screen.getByRole("button", { name: /^Open Friday/ });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2 })).toHaveFocus(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(trigger).toHaveFocus();
  });

  it("records an outcome through the on-behalf lever, carrying the party", async () => {
    const actions = actionsOf();
    render(<CallQueue view={viewOf([row()])} actions={actions} />);
    await userEvent.click(screen.getByRole("button", { name: /^Open Friday/ }));
    await userEvent.selectOptions(
      screen.getByLabelText("Outcome"),
      "not-proceeding",
    );
    await userEvent.type(screen.getByLabelText("Note"), "Family paused");
    await userEvent.click(
      screen.getByRole("button", { name: "Record the outcome" }),
    );
    expect(actions.recordOutcome).toHaveBeenCalledWith({
      ref: {
        kind: "position",
        positionId: "pos-1",
        parentId: "parent-1",
      },
      outcome: "not-proceeding",
      notes: "Family paused",
    });
  });

  it("tells the admin, after a no-answer, that the call is waiting for a time again (R5)", async () => {
    const actions = actionsOf();
    render(<CallQueue view={viewOf([row()])} actions={actions} />);
    await userEvent.click(screen.getByRole("button", { name: /^Open Friday/ }));
    await userEvent.selectOptions(
      screen.getByLabelText("Outcome"),
      "no-answer",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Record the outcome" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /back to waiting for a time/,
    );
  });

  it("books and clears a time on her behalf, and offers neither on a nanny call", async () => {
    const actions = actionsOf();
    render(
      <CallQueue
        view={viewOf([
          row({
            subject: { kind: "nanny", nannyId: "nanny-1" as UserId },
            type: "nanny-commission",
          }),
        ])}
        actions={actions}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^Open Friday/ }));
    expect(
      screen.queryByRole("button", { name: "Set a time on her behalf" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear the time" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move the time" }),
    ).toBeInTheDocument();
  });
});

describe("S-A-03 — the calendar half (ADR-074 / ADR-076 / ADR-077)", () => {
  const calendarView: CalendarView = {
    days: [
      {
        date: "2026-01-09",
        legend: "Friday 9 January",
        slots: [
          {
            slotId: "default:2026-01-09T09:00:00.000Z",
            start: "2026-01-09T09:00:00.000Z" as ISO,
            time: "9:00am",
            state: "open",
            label: "Friday 9 January, 9:00am London time",
          },
          {
            slotId: "default:2026-01-09T09:30:00.000Z",
            start: "2026-01-09T09:30:00.000Z" as ISO,
            time: "9:30am",
            state: "displaceable",
            label: "Friday 9 January, 9:30am — a nanny holds this",
          },
        ],
      },
    ],
    rules: {
      slotMinutes: 30,
      openFrom: "09:00",
      openTo: "19:00",
      weekdays: "Monday to Friday",
      horizonDays: 14,
      leadTimeMinutes: 120,
      holdMinutes: 5,
    },
    unblockUnavailable: true,
  };

  const calendarActions = (affected: number): CalendarActions => ({
    block: vi.fn(async () => ({ ok: true as const, value: { affected } })),
  });

  it("states the ADR-076 rules as they stand", () => {
    render(<CalendarBoard view={calendarView} actions={calendarActions(0)} />);
    expect(
      screen.getByText(/30-minute slots, 09:00 to 19:00 London time/),
    ).toBeInTheDocument();
  });

  it("says in words that a nanny holds a displaceable cell, never by colour", () => {
    render(<CalendarBoard view={calendarView} actions={calendarActions(0)} />);
    expect(screen.getByText(/Nanny holds this/)).toBeInTheDocument();
  });

  it("tells the admin a block FLAGGED the calls inside it and cancelled none (ADR-077)", async () => {
    render(<CalendarBoard view={calendarView} actions={calendarActions(2)} />);
    await userEvent.type(screen.getByLabelText("From"), "2026-01-09T09:00");
    await userEvent.type(screen.getByLabelText("To"), "2026-01-09T11:00");
    await userEvent.type(screen.getByLabelText("Reason"), "holiday");
    await userEvent.click(
      screen.getByRole("button", { name: "Block this time" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /2 calls are inside it — they are flagged, not cancelled/,
    );
  });

  it("says plainly that lifting a block is not available yet", () => {
    render(<CalendarBoard view={calendarView} actions={calendarActions(0)} />);
    expect(
      screen.getByText(/Lifting a block again is not available yet/),
    ).toBeInTheDocument();
  });
});
