// S-P-08's own claims (ADR-120 rule 1): the semantics 04 §6.2 and a11y-15 ask for, and the states the screen is
// specified to have. The card vocabulary is `connection-card-view.ts`'s and is asserted through the screen,
// because that is where a family meets it.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParentConnections, connectionCardView } from "@/modules/connections";
import type { ConnectionSummary } from "@/modules/connections";
import type {
  ConnectionId,
  Instant,
  NannyId,
  PositionId,
} from "@/modules/shared-types";

const POSITION = "00000000-0000-4000-8000-0000000000p1" as PositionId;
const NANNY = "00000000-0000-4000-8000-0000000000n1" as NannyId;

const row = (over: Partial<ConnectionSummary>): ConnectionSummary =>
  Object.freeze({
    connectionId: "00000000-0000-4000-8000-0000000000c1" as ConnectionId,
    positionId: POSITION,
    nannyId: NANNY,
    stage: "REQUEST_SENT",
    origin: "parent_request",
    ...over,
  });

const cardsOf = (rows: ReadonlyArray<ConnectionSummary>) =>
  rows.map(connectionCardView);

describe("S-P-08 — the parent's connections (04 §6.2)", () => {
  it("is a list with a heading, so a screen reader can move by landmark", () => {
    render(<ParentConnections cards={cardsOf([row({})])} />);
    expect(
      screen.getByRole("heading", { name: "Your nannies" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("says what is happening rather than showing the enum", () => {
    render(
      <ParentConnections
        cards={cardsOf([
          row({ stage: "ACCEPTED" }),
          row({
            connectionId:
              "00000000-0000-4000-8000-0000000000c2" as ConnectionId,
            stage: "DECLINED",
          }),
        ])}
      />,
    );
    expect(screen.getByText("She's keen")).toBeInTheDocument();
    expect(screen.getByText("Pick a time to meet")).toBeInTheDocument();
    expect(screen.getByText("She's not available")).toBeInTheDocument();
    expect(screen.queryByText(/ACCEPTED|DECLINED/)).not.toBeInTheDocument();
  });

  // 04 §6.2 and §9: an admin-set time is shown as arranged by the matchmaker, in those exact words. A
  // parent-set time is not — she set it, and telling her someone else did would be untrue.
  it("names the matchmaker on a time she did not set, and not on one she did", () => {
    const at = "2026-03-10T14:00:00+00:00" as Instant;
    render(
      <ParentConnections
        cards={cardsOf([
          row({
            stage: "INTRO_SCHEDULED",
            meetingAt: at,
            meetingSetBy: "admin",
          }),
        ])}
      />,
    );
    expect(screen.getByText(/arranged by your matchmaker/)).toBeInTheDocument();

    const own = cardsOf([
      row({ stage: "INTRO_SCHEDULED", meetingAt: at, meetingSetBy: "parent" }),
    ]);
    expect(own[0]?.detail).not.toContain("arranged by your matchmaker");
  });

  // ADR-074: one timezone, said out loud. A family reading "2:00pm" with no zone cannot act on it.
  it("shows a meeting time in London words, with the zone named", () => {
    render(
      <ParentConnections
        cards={cardsOf([
          row({
            stage: "INTRO_SCHEDULED",
            meetingAt: "2026-03-10T14:00:00+00:00" as Instant,
          }),
        ])}
      />,
    );
    expect(screen.getByText(/London time/)).toBeInTheDocument();
    expect(screen.getByText(/Tuesday 10 March/)).toBeInTheDocument();
  });

  // 04 §7.1's rule, applied to a list rather than a rail: never an empty room.
  it("tells a family what is happening when she has no nannies yet", () => {
    render(<ParentConnections cards={[]} />);
    expect(screen.getByText(/lining up your top nannies/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  // a11y-15's L·E·E: a failed read keeps the screen and announces the failure; it does not blank the page.
  it("keeps the heading and announces a failed read", () => {
    render(<ParentConnections cards={[]} failed={true} />);
    expect(
      screen.getByRole("heading", { name: "Your nannies" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn’t load/);
  });

  it("marks a finished connection closed, in a word and not a colour", () => {
    render(<ParentConnections cards={cardsOf([row({ stage: "FINISHED" })])} />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("Finished")).toBeInTheDocument();
  });
});
