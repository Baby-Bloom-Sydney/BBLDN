// The boot slot for the module-level `adminOnBehalf` binding. Fails closed until `configureAdminOnBehalf`
// installs the inside — and this one is the most important fail-closed default in the fan-out: every method here
// moves a real family's or nanny's stage. The inside is not written in this unit because it must begin with
// `auth.requireRole('admin')` + `mfaVerified` (07 §5.4 row 2), which is a security-reviewed surface.
import { err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { AdminOnBehalf } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Admin-on-behalf is not configured", {
  reason: "admin-on-behalf-not-configured" as const,
});

const unconfigured: AdminOnBehalf = Object.freeze({
  advance: async () => NOT_CONFIGURED,
  listAllowed: async () => Object.freeze([]),
  chooseSlot: async () => NOT_CONFIGURED,
  moveSlot: async () => NOT_CONFIGURED,
  clearSlot: async () => NOT_CONFIGURED,
  recordOutcome: async () => NOT_CONFIGURED,
  bookNannyCall: async () => NOT_CONFIGURED,
  autofire: async () => NOT_CONFIGURED,
});

const slot = { current: unconfigured };

export const ADMIN_ON_BEHALF_REGISTRY: Registry<AdminOnBehalf> = Object.freeze({
  get: () => slot.current,
  set: (next: AdminOnBehalf) => {
    slot.current = next;
  },
});
