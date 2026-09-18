// S-A-16's read (04 §6.4; ADR-159): the tab's rows through `verification.listQueue`, the counters through
// `adminOverview`, the open row through `readQueueRecord` — each decorated with a name from `auth` (03 §3.6).
// The connector gates on the admin role itself; a refusal renders as the forbidden state, a read that could not
// be made as unavailable — never as an empty queue, which would read as "nothing to do".
import { log } from "@/modules/platform";
import type { SubmissionId } from "@/modules/shared-types";
import { verification } from "@/modules/verification";
import type { OpenRecord, QueueQuery, VerificationQueueView } from "../types";
import { nannyNameOf } from "./nanny-name-of";

export async function loadVerificationQueue(
  query: QueueQuery & { readonly open: SubmissionId | null },
): Promise<VerificationQueueView> {
  const [listed, overview] = await Promise.all([
    verification.listQueue(query),
    verification.adminOverview(),
  ]);
  if (!listed.ok || !overview.ok) {
    const error = listed.ok ? overview : listed;
    if (!error.ok && error.error.details?.reason === "not-permitted")
      return { kind: "forbidden" };
    log.warn("verification queue could not be read", {
      module: "admin-verification",
      action: "loadVerificationQueue",
      reason: error.ok ? "unknown" : (error.error.details?.reason ?? error.error.code),
    });
    return { kind: "unavailable" };
  }
  const rows = await Promise.all(
    listed.value.map(async (entry) => ({
      ...entry,
      nannyName: await nannyNameOf(entry.nannyId),
    })),
  );
  let open: OpenRecord | null = null;
  if (query.open !== null) {
    const record = await verification.readQueueRecord(query.open);
    if (record.ok)
      open = { ...record.value, nannyName: await nannyNameOf(record.value.entry.nannyId) };
    else
      log.warn("verification submission could not be opened", {
        module: "admin-verification",
        action: "loadVerificationQueue",
        reason: record.error.details?.reason ?? record.error.code,
      });
  }
  return {
    kind: "queue",
    query: { tab: query.tab, filter: query.filter },
    rows,
    overview: overview.value,
    open,
  };
}
