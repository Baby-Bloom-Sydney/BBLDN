// 01 §6.3 amended / 03 §1.4 — the data-access port. A caller hands over a **named** operation and gets a `Result`;
// it never sees a client, a driver type or a raw error. Two scopes: `session` (RLS as the caller) and `service`
// (named jobs and definers only — every use listed in the module README). A `{ uow }` is honoured through the
// unit-of-work join (ADR-127): the operation runs on a guarded `Query` that allows exactly one `rpc()` — the
// transaction — and no table write beside it (`guard-unit-of-work-query.ts`).
import { err, fromThrown, log, ok, unitOfWorkJoin } from "@/modules/platform";
import type { UnitOfWorkJoin } from "@/modules/platform";
import type { Query, Result, Url } from "@/modules/shared-types";
import type {
  AppDatabase,
  AuthDriver,
  DataAccessPort,
  NamedOperation,
  RunOptions,
  StorageRef,
} from "../types";
import { guardUnitOfWorkQuery } from "./guard-unit-of-work-query";
import { isSafeObjectPath } from "./is-safe-object-path";
import { SIGNED_URL_TTL_CEILING } from "./signed-url-ttl-ceiling";
import { UnitOfWorkRefusal } from "./unit-of-work-refusal";

/** The token is judged before the driver is touched: a refused unit of work runs nothing, not even a scope read. */
function queryFor(
  driver: AuthDriver<AppDatabase>,
  join: UnitOfWorkJoin,
  opts: RunOptions | undefined,
): Result<Query<AppDatabase>> {
  if (opts?.uow !== undefined && !join.isOpen(opts.uow))
    return err("INTERNAL", "Unit of work is not open", {
      reason: "unit-of-work-unknown",
    });
  const query = driver.query(opts?.scope ?? "session");
  return ok(
    opts?.uow === undefined
      ? query
      : guardUnitOfWorkQuery(query, opts.uow, join),
  );
}

export function createDataAccessPort(
  driver: AuthDriver<AppDatabase>,
  join: UnitOfWorkJoin = unitOfWorkJoin,
): DataAccessPort<AppDatabase> {
  const run = async <T>(
    op: NamedOperation<T>,
    opts?: RunOptions,
  ): Promise<Result<T>> => {
    const query = queryFor(driver, join, opts);
    if (!query.ok) return query;
    // 01 §6.3: every RLS-bypassing use must be named and reviewed. The technical enforcement is a review, so the
    // least this choke point owes is an audit line naming the operation that asked for it.
    if (opts?.scope === "service")
      log.info("service-scope data access", {
        module: "auth",
        action: op.name,
        scope: "service",
      });
    try {
      return ok(await op.exec(query.value));
    } catch (thrown) {
      if (thrown instanceof UnitOfWorkRefusal) return thrown.result;
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
      ttlSeconds > SIGNED_URL_TTL_CEILING[ref.bucket]
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
