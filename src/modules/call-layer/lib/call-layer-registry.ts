// The boot slot for the module-level `callLayer` binding. Fails closed until `configureCallLayer` installs the
// inside: every method here either writes a booking (`scheduling`) or moves a stage (`positions.advance`), and
// both need the S5 schema. A default that answered would tell a parent a call was booked when nothing was.
import { createRegistry, err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { CallLayer } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Call layer is not configured", {
  reason: "call-layer-not-configured" as const,
});

const unconfigured: CallLayer = Object.freeze({
  listSlots: async () => NOT_CONFIGURED,
  chooseSlot: async () => NOT_CONFIGURED,
  moveSlot: async () => NOT_CONFIGURED,
  clearSlot: async () => NOT_CONFIGURED,
  openNannyCall: async () => NOT_CONFIGURED,
  recordOutcome: async () => NOT_CONFIGURED,
  getCallState: async () => NOT_CONFIGURED,
  findOpenCall: async () => NOT_CONFIGURED,
  findNannyBooking: async () => NOT_CONFIGURED,
  listOpenCalls: async () => NOT_CONFIGURED,
});

export const CALL_LAYER_REGISTRY: Registry<CallLayer> =
  createRegistry<CallLayer>(unconfigured);
