// A module has one entry point — its `index.ts`. `config` has two: the universal client-safe connector and
// `@/modules/config/server`, the `server-only` half that carries `env` + the server flags (01 §3.3
// one-reader-per-side; 05 §7 rule 2's named exception; S2's requirement, recorded in `docs/build-progress.md`).
export const EXTRA_ENTRY_POINTS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({ config: Object.freeze(["server"]) });
