// src/boot — the boot-time composition root's type surface. `src/instrumentation.ts` (Next's `register()` hook)
// calls `wirePorts`, and this is what it gets back: one row per port saying which binding boot chose and, when
// that binding is not the real inside, why (05 §3 rule 1 — every binding is chosen by `config` / env here, never
// by an import edit; a reason on a row is a recorded gap, never a silent stub).
export type BootPort =
  | "unit-of-work"
  | "auth"
  | "events"
  | "consent"
  | "rate-limit"
  | "areas"
  | "comms"
  | "scheduling"
  | "scoring"
  | "matching"
  | "call-layer"
  | "parent-profile";

export type PortWiring = {
  readonly port: BootPort;
  /** the binding installed — `unconfigured` when boot deliberately left the port on its fail-closed default */
  readonly binding: string;
  /** present iff the binding is not the real inside: the recorded reason and its owner */
  readonly reason?: string;
};

export type BootReport = ReadonlyArray<PortWiring>;
