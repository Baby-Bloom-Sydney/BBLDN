// S-P-08's server read: who is signed in → her connections → the cards. One read, one shape; the route decides
// nothing but where to send a parent who is not signed in (05 §7 rule 5 — thin routes).
//
// SEAM, carried from `1d` / `1e`: the reads are keyed by `ParentId` (03 §2.5 `JourneyOwner`) while a session
// carries the `UserId`, and 02 §4.2 gives `parents` its own id beside `user_id`. This is the third place that
// one-line pass-through lives, and it stays open until the marketplace store lands.
import { auth } from "@/modules/auth";
import type { ParentId } from "@/modules/shared-types";
import { connections } from "./default-connections";
import { connectionCardView } from "./connection-card-view";
import type { ParentConnectionsLoad } from "../types";

export async function loadParentConnections(): Promise<ParentConnectionsLoad> {
  const session = await auth.requireRole("parent");
  if (!session.ok) return { kind: "signed-out" };
  const owner = session.value.userId as string as ParentId;
  const rows = await connections.forParent(owner);
  if (!rows.ok) return { kind: "failed" };
  // Newest first: the nanny a family acted on most recently is the one she came back for.
  const ordered = [...rows.value].sort((a, b) =>
    (b.meetingAt ?? "").localeCompare(a.meetingAt ?? ""),
  );
  return {
    kind: "cards",
    cards: Object.freeze(ordered.map(connectionCardView)),
  };
}
