// The one refusal every bounded calendar write gives back (07 §8; 01 §4a rule 2). It says nothing about which
// limit was reached or whose — "over the limit" and "the limiter is down" read identically to a caller,
// because the difference is operational and telling it apart is a probe.
import { err } from "@/modules/platform";
import type { CallErrorDetails } from "../types";

export const refuseBooking = () =>
  err<CallErrorDetails>("CONFLICT", "That time couldn't be set — try again.", {
    reason: "E_PRECONDITION_FAILED",
    which: "rate-limit",
  });
