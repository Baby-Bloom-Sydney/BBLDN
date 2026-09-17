// S-A-03 / S-A-04 — the call queue and the one live admin calendar on a single screen (ADR-074; 04 §6.4).
//
// Thin by rule (01 §2.5): the page gates on the admin role through `auth` — the middleware is the coarse gate,
// not the only one (07 §5.4 row 1) — reads through the two panels, and renders. `requireRole('admin')` also
// requires `aal2` (row 2), and every connector behind these reads gates again on its own.
//
// `09.01` is `auth`'s gate, used here rather than re-implemented; `09.02` is the nav row, in `Sidebar` and
// `MobileNav`; `09.23` is everything below.
import { notFound } from "next/navigation";
import { auth } from "@/modules/auth";
import {
  CalendarBoard,
  CallQueue,
  blockRangeAction,
  bookCallSlotAction,
  clearCallSlotAction,
  loadCalendarBoard,
  loadCallQueue,
  moveCallSlotAction,
  recordCallOutcomeAction,
} from "@/modules/admin";
import type { Actor, AdminId } from "@/modules/shared-types";

export const dynamic = "force-dynamic";

/** The connectors take an `Actor` for their signature; each reads the session for authority (FIX-1). */
const SESSION_ADMIN: Actor = Object.freeze({
  kind: "admin",
  id: "session" as AdminId,
});

export default async function AdminCallsPage() {
  const session = await auth.requireRole("admin");
  if (!session.ok) notFound();

  const [queue, calendar] = await Promise.all([
    loadCallQueue(SESSION_ADMIN),
    loadCalendarBoard(),
  ]);

  return (
    <main aria-labelledby="call-queue-heading">
      {queue.kind === "queue" ? (
        <CallQueue
          view={queue.view}
          actions={{
            recordOutcome: recordCallOutcomeAction,
            move: moveCallSlotAction,
            clear: clearCallSlotAction,
            book: bookCallSlotAction,
          }}
        />
      ) : (
        <section aria-labelledby="call-queue-heading">
          <h1 id="call-queue-heading">Call queue</h1>
          <p role="alert">
            {queue.kind === "forbidden"
              ? "This screen needs an admin sign-in with a second factor."
              : "The call list could not be read. Reload the page."}
          </p>
        </section>
      )}

      {calendar.kind === "calendar" ? (
        <CalendarBoard
          view={calendar.view}
          actions={{ block: blockRangeAction }}
        />
      ) : (
        <section aria-labelledby="calendar-heading">
          <h2 id="calendar-heading">Calendar</h2>
          <p role="alert">
            {calendar.kind === "forbidden"
              ? "This screen needs an admin sign-in with a second factor."
              : "The calendar could not be read. Reload the page."}
          </p>
        </section>
      )}
    </main>
  );
}
