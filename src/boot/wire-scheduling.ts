// `scheduling` (03 §3; ADR-074) — the real inside, in **every** environment (`1f`).
//
// It replaces the in-memory stub P1-WIRE installed outside production only, and closes the hole that wiring
// left open: production sat on the fail-closed default, so the London calendar did not exist there at all. The
// inside stands on `auth`'s data port and `book_slot()` (02 §7), both of which are real wherever a database is,
// so there is no longer an environment in which the stub is the better answer — a calendar that forgets a
// family's call on a cold start was only ever a placeholder for this.
//
// The binding is still chosen here rather than by an import edit (05 §3 rule 1), and the report still carries
// its reason; what changed is that the reason is no longer "there is no inside". One thing it is honest about:
// `unblock` is not built — no write available to the module lifts a block (see
// `scheduling/lib/scheduling-admin-writes.ts` and the `1f` PROGRESS entry).
import { auth } from "@/modules/auth";
import { configureScheduling, createScheduling } from "@/modules/scheduling";
import type { PortWiring } from "./types";

export function wireScheduling(): PortWiring {
  configureScheduling(createScheduling({ auth }));
  return {
    port: "scheduling",
    binding: "db inside",
    reason:
      "02 §4.4's four tables through auth's data port; book_slot() (02 §7) is the one booking transaction, displacement included (ADR-127). Not built: unblock — 03 §1.4's Query has no delete and availability_blocks has no revocation column",
  };
}
