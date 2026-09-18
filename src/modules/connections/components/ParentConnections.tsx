// S-P-08 — `/parent/connections` (04 §6.2): every nanny this family asked for, where each one stands, and the
// meeting times in the one timezone (ADR-074; `LOCALE` owns it, and `connection-card-view.ts` reads it there).
//
// Semantics are the list's own (a11y-15's L·E·E, and the rail's precedent): an `<ol>` of cards, each state as
// **visible text** rather than colour, the failed read shown as an error line with the labels still standing
// rather than an empty screen, and the empty case saying what to do instead of reading as a blank room.
//
// `2d` closed kickoff debt 2: each card is headed by the nanny it is about (04 §7.1 `{nanny}`), with the stage
// phrase underneath. A card whose name could not be read keeps the shape it had before — the stage phrase as the
// heading — rather than showing a raw id.
import type { ParentConnectionsProps } from "../types";

function Card({
  card,
}: {
  readonly card: ParentConnectionsProps["cards"][number];
}) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      {card.nannyFirstName !== undefined && (
        <p className="text-base font-semibold text-slate-900">
          {card.nannyFirstName}
        </p>
      )}
      <p
        className={
          card.nannyFirstName === undefined
            ? "text-sm font-semibold text-slate-900"
            : "mt-1 text-sm font-medium text-slate-700"
        }
      >
        {card.state}
      </p>
      {card.detail !== undefined && (
        <p className="mt-1 text-sm text-slate-600">
          {card.meetingAt === undefined ? (
            card.detail
          ) : (
            <time dateTime={card.meetingAt}>{card.detail}</time>
          )}
        </p>
      )}
      {!card.live && (
        <p className="mt-1 text-xs [letter-spacing:0.08em] text-slate-500 uppercase">
          Closed
        </p>
      )}
    </li>
  );
}

export function ParentConnections({ cards, failed }: ParentConnectionsProps) {
  return (
    <section
      aria-labelledby="parent-connections-heading"
      className="mx-auto max-w-2xl p-6"
    >
      <h1
        id="parent-connections-heading"
        className="text-2xl font-semibold text-slate-900"
      >
        Your nannies
      </h1>

      {failed === true && (
        <p role="alert" className="mt-3 text-sm text-slate-700">
          We couldn&rsquo;t load your nannies just now. Try again in a moment.
        </p>
      )}

      {cards.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          Nothing here yet. Your matchmaker is lining up your top nannies, and
          anyone you reach out to yourself will show up here.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {cards.map((card) => (
            <Card key={card.connectionId} card={card} />
          ))}
        </ol>
      )}
    </section>
  );
}
