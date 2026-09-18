// `call-layer` (03 §2.7) — the orchestrator, the C-row slice, and now the **real mirror**, in every environment
// (`1g`).
//
// What this file used to say, and why it no longer says it: `memoryCallMirrorStore` is per instance and forgets
// every booked call on a cold start, so on a serverless runtime a family could be told her call was set when
// nothing said so. That is a silent loss rather than a stub, and it is why the module was installed outside
// production only. Migration `0018` gives the mirror's detail a table, `upsert_call_mirror()` gives it one
// atomic write, and `dbCallMirrorStore` reads the state back off `nanny_positions` where R-1 always kept it —
// so the reason for the refusal is gone, and with it the refusal. `wire-scheduling.ts` made the same move for
// the same reason one unit earlier.
//
// The slice is handed to the stage model over the **same store instance** the orchestrator reads (03 §2.1 —
// this is the whole reason `positions` never imports `call-layer`; fix A-2 / R2). Two stores would let
// `advance` write one mirror and `getCallState` read another.
import { auth } from "@/modules/auth";
import {
  configureCallLayer,
  createCallLayer,
  createCallLayerSlice,
  registerCallLayerSlice,
} from "@/modules/call-layer";
import { comms } from "@/modules/comms";
import { SENDERS } from "@/modules/config/server";
import { scheduling } from "@/modules/scheduling";
import { dbCallMirrorStore } from "./db-call-mirror-store";
import type { PortWiring } from "./types";

export function wireCallLayer(): PortWiring {
  const store = dbCallMirrorStore(auth.data);
  // S-N-02's `admin-commission-booking` (04 §4.4 c3; `08.18`) goes to the admin mailbox, which is env through
  // `config/server` — the module may not read env and may not carry an address literal (L4), so boot hands it in.
  configureCallLayer(
    createCallLayer({
      store,
      scheduling,
      comms,
      adminEmail: SENDERS.admin.address,
    }),
  );
  registerCallLayerSlice(createCallLayerSlice({ store, scheduling }));
  return {
    port: "call-layer",
    binding: "create-call-layer + the C-row slice, over one db mirror",
    reason:
      "the mirror is nanny_positions' call columns (0006, R-1: the state) joined to position_call_mirror (0018: the detail), and the C rows write both through upsert_call_mirror() in one transaction (ADR-127). No environment gate: a store over a real schema is real wherever a database is",
  };
}
