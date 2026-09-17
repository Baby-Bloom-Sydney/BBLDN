// `call-layer` (03 §2.7) — the orchestrator and the C-row slice are the real inside (1d), but the mirror they
// write is not: `memoryCallMirrorStore` is per instance and forgets every booked call on a cold start. On a
// serverless runtime that is a family told her call is set when nothing says so — a silent loss, not a stub —
// so the same rule `wire-scheduling.ts` applies: installed **outside production only**, chosen by the resolved
// environment (05 §3 rule 1), and production stays on the fail-closed default and says why.
//
// The slice is handed to the stage model over the **same store instance** the orchestrator reads (03 §2.1 —
// this is the whole reason `positions` never imports `call-layer`; fix A-2 / R2). Two stores would let
// `advance` write one mirror and `getCallState` read another.
import {
  configureCallLayer,
  createCallLayer,
  createCallLayerSlice,
  memoryCallMirrorStore,
  registerCallLayerSlice,
} from "@/modules/call-layer";
import { comms } from "@/modules/comms";
import type { Environment } from "@/modules/config";
import { scheduling } from "@/modules/scheduling";
import type { PortWiring } from "./types";

const MEMORY_MIRROR =
  "the call mirror is memoryCallMirrorStore — per instance, and it forgets every booked call on a cold start; the store over nanny_positions' four call columns (0006) needs positions' inside (1e) and the RPC opener (ADR-127)";

export function wireCallLayer(environment: Environment): PortWiring {
  if (environment === "production")
    return {
      port: "call-layer",
      binding: "unconfigured",
      reason: `${MEMORY_MIRROR}; refused in production because a cold start would drop a family's booked call silently — scheduling is refused there for the same reason`,
    };
  const store = memoryCallMirrorStore();
  configureCallLayer(createCallLayer({ store, scheduling, comms }));
  registerCallLayerSlice(createCallLayerSlice({ store, scheduling }));
  return {
    port: "call-layer",
    binding: "create-call-layer + the C-row slice, over one memory mirror",
    reason: `${MEMORY_MIRROR}; preview and development only`,
  };
}
