// 01 §6.3 amended / 03 §1.4 — the data-access port. A caller hands over a **named** operation and gets a `Result`;
// it never sees a client, a driver type or a raw error. Two scopes: `session` (RLS as the caller) and `service`
// (named jobs and definers only — every use listed in the module README).
import { err, fromThrown, ok } from "@/modules/platform";
import { SECURITY } from "@/modules/config";
import type { Result, Url } from "@/modules/shared-types";
import type {
  AppDatabase,
  AuthDriver,
  DataAccessPort,
  NamedOperation,
  RunOptions,
  StorageRef,
} from "../types";
import { isSafeObjectPath } from "./is-safe-object-path";

/** The longest TTL any surface is allowed (07 §5.3 rule 1 — browse / profile at 24 h is the ceiling). */
const MAX_TTL_SECONDS = Math.max(
  ...Object.values(SECURITY.signedUrlTtlSeconds),
);
const UOW_MESSAGE = "This operation could not be completed.";

export function createDataAccessPort(
  driver: AuthDriver<AppDatabase>,
): DataAccessPort<AppDatabase> {
  const run = async <T>(
    op: NamedOperation<T>,
    opts?: RunOptions,
  ): Promise<Result<T>> => {
    // The transaction opener behind `platform.withUnitOfWork` is undecided (03 §1.4; the S4 KEY decision), so a
    // `uow` cannot be honoured. Refusing is the only safe answer: running the operation outside the caller's
    // transaction would silently break the atomicity they asked for.
    if (opts?.uow !== undefined)
      return err("INTERNAL", UOW_MESSAGE, {
        reason: "unit-of-work-not-supported",
      });
    try {
      return ok(await op.exec(driver.query(opts?.scope ?? "session")));
    } catch (thrown) {
      return fromThrown(thrown, { module: "auth", action: op.name });
    }
  };

  const signUrl = async (
    ref: StorageRef,
    ttlSeconds: number,
  ): Promise<Result<Url>> => {
    if (!isSafeObjectPath(ref.path))
      return err("VALIDATION", "That file could not be found.", {
        reason: "invalid-object-path",
      });
    if (
      !Number.isInteger(ttlSeconds) ||
      ttlSeconds <= 0 ||
      ttlSeconds > MAX_TTL_SECONDS
    )
      return err("VALIDATION", "That link could not be created.", {
        reason: "invalid-ttl",
      });
    try {
      return ok((await driver.createSignedUrl(ref, ttlSeconds)) as Url);
    } catch (thrown) {
      return fromThrown(thrown, { module: "auth", action: "signUrl" });
    }
  };

  return Object.freeze({ run, signUrl });
}
