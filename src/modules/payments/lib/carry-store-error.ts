// A store failure re-told in `payments`' own vocabulary. The store speaks the generic `Result` of 03 §1.4, whose
// details are `Record<string, unknown>`; every method on the connector promises `PaymentsErrorDetails`. Carrying
// the original code through would let a driver's `NOT_FOUND` read as "no such family" on a money screen, so the
// code is fixed at `INTERNAL` — the provider keeps retrying — and the original travels in the message for the
// runbook to triage on.
import type { AppError } from "@/modules/shared-types";
import type { PaymentsErrorDetails } from "../types";
import { fail } from "./fail";

export function carryStoreError(error: { readonly code: string }): {
  readonly ok: false;
  readonly error: AppError<PaymentsErrorDetails>;
} {
  return fail(
    "E_STORE",
    `The record could not be read or written (${error.code})`,
  );
}
