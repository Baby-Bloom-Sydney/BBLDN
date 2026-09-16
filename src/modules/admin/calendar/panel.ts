// The one live admin calendar (ADR-074) — the same bookings as the queue, laid on the admin's availability with
// open / block / unblock and the slot rules. It shares `/admin/calls` with `call-queue` because ADR-074 merged
// the list and the calendar onto one screen; it stays a panel of its own because 00-glossary §3 names it one.
import type { AdminPanel } from "../types";

export const CALENDAR_PANEL: AdminPanel = Object.freeze({
  name: "calendar",
  path: "/admin/calls",
  screens: Object.freeze(["S-A-03"]),
});
