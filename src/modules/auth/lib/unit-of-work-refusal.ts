// The one way the unit-of-work guard (`guard-unit-of-work-query.ts`) stops a `NamedOperation` mid-flight: the
// `Query` it was handed refuses a call by throwing this, and `DataAccessPort.run` — the one place a throw becomes
// a `Result` (01 §4a rule 1) — recognises it and returns the carried error instead of a generic `INTERNAL`.
// It is a class so the port can tell a refusal from a driver failure by `instanceof`, not by message text.
import type { AppError } from "@/modules/shared-types";

export class UnitOfWorkRefusal extends Error {
  readonly result: { readonly ok: false; readonly error: AppError };

  constructor(result: { readonly ok: false; readonly error: AppError }) {
    super(result.error.message);
    this.name = "UnitOfWorkRefusal";
    this.result = result;
  }
}
