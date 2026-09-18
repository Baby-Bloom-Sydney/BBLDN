// `?tab=` · `?filter=` · `?open=` as S-A-16 reads them (04 §6.4): an unknown value falls back to the first tab and
// the needs-a-person filter — a malformed URL is never an error on an admin list. Pure.
import type { SubmissionId } from "@/modules/shared-types";
import type { QueueQuery, QueueTab } from "../types";

const TABS: ReadonlyArray<QueueTab> = ["identity", "dbs", "right-to-work"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const one = (value: string | string[] | undefined): string | undefined =>
  typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value[0]
      : undefined;

export function parseQueueQuery(
  params: Readonly<Record<string, string | string[] | undefined>>,
): QueueQuery & { readonly open: SubmissionId | null } {
  const tab = one(params.tab);
  const filter = one(params.filter);
  const open = one(params.open);
  return {
    tab: TABS.includes(tab as QueueTab) ? (tab as QueueTab) : "identity",
    filter: filter === "stale-pending" ? "stale-pending" : "needs-admin",
    open: open !== undefined && UUID.test(open) ? (open as SubmissionId) : null,
  };
}
