// 03 §9.2 rule 1 — a post-commit sink is awaited with `timeoutMs`; past it the fan-out moves on and the sink's
// late result is ignored (never retried in-process). A rejection becomes a `Result` — the caller never throws.
import type { Result } from "@/modules/shared-types";
import type { TimeoutDetails } from "../types";
import { err } from "../../lib/err";
import { fromThrown } from "../../lib/from-thrown";

export function withTimeout<T>(
  run: () => Promise<Result<T>>,
  timeoutMs: number,
): Promise<Result<T, TimeoutDetails>> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () =>
        resolve(
          err("INTERNAL", "Sink timed out", { reason: "timeout", timeoutMs }),
        ),
      timeoutMs,
    );
    Promise.resolve()
      .then(run)
      .then(
        (result) => {
          clearTimeout(timer);
          resolve(
            result.ok
              ? result
              : err(
                  result.error.code,
                  result.error.message,
                  { reason: "INTERNAL" },
                  result.error,
                ),
          );
        },
        (thrown: unknown) => {
          clearTimeout(timer);
          resolve(
            err(
              "INTERNAL",
              fromThrown(thrown).error.message,
              { reason: "INTERNAL" },
              thrown,
            ),
          );
        },
      );
  });
}
