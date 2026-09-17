// scheduling connector (03 §3; ADR-074) — one live admin calendar on the config timezone: rules + blocks
// bookings, computed at read. It owns slots and bookings; it never moves a stage, sends no message and
// imports no business module (03 §3.6).
//
// **Importers are `call-layer`, `admin` and `admin-on-behalf` only** (R3). `onboarding-nanny` and
// `public-site` reach S-N-02 through `call-layer.listSlots` / `openNannyCall`, never through this module.
//
// The module-level `scheduling` fails closed until `configureScheduling` installs an implementation — the
// in-memory `createSchedulingStub()` today, the real inside when its tables are on `main`.
export type * from "./types";

export { scheduling } from "./lib/default-scheduling";
export { configureScheduling } from "./lib/configure-scheduling";
export { unconfiguredScheduling } from "./lib/unconfigured-scheduling";

// The real inside (`1f`) — 02 §4.4's four tables through `auth`'s data port, `book_slot()` (02 §7) for the one
// booking transaction. Selected at boot, never by editing an import (05 §3 rule 1).
export { createScheduling } from "./lib/create-scheduling";

// The stub (03 §3.6) — still the swap test's second implementation and every test's calendar double.
export { createSchedulingStub } from "./scheduling.stub";

// The pure rules the stub and the real inside share (03 §3.6).
export { generateSlots } from "./lib/generate-slots";
export { nextFreeSlot } from "./lib/next-free-slot";
export { canMoveStatus } from "./lib/status-lattice";
export { londonInstant } from "./lib/london-instant";
export { londonOffsetMinutes } from "./lib/london-offset-minutes";
