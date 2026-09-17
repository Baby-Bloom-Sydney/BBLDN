"use server";
// `04.12` — S-P-07's in-app Connect: a signed-in parent with a live position asks for a nanny (K-1), and the
// row's own cascade opens her call (C-c), which is the page 04 §3.3 trigger (c) says she lands on.
//
// A form action, so it works with no script (01 §4d: the server decides, never the client). Three things it
// does **not** do, each deliberately:
//
//   It does not trust the `positionId` in the form. It cannot look one up — `connections` has no arrow to
//   `positions` (01 §2.3) — so the id travels in the request, and the K-1 row refuses it unless the position's
//   own parent is the caller. That check lives in the slice, where every caller gets it, rather than here where
//   only this one would (the `1f` CRITICAL's lesson: a client-supplied subject id is not authority).
//   It does not take the parent's identity from the form. The session is the only authority.
//   It does not decide where the parent goes on failure beyond the profile she came from: a refusal reason is
//   the row's, and 07 §4 says one message either way, so "not yours" and "no such position" read the same.
import { redirect } from "next/navigation";
import { auth } from "@/modules/auth";
import { newId } from "@/modules/platform";
import type { ConnectionId, NannyId, PositionId } from "@/modules/shared-types";
import { CONNECTIONS_PATHS } from "../lib/connections-paths";
import { CONNECTIONS_DISPATCH } from "../lib/connections-dispatch";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const text = (value: FormDataEntryValue | null): string =>
  typeof value === "string" ? value.trim() : "";

export async function connectToNannyAction(formData: FormData): Promise<never> {
  const nannyId = text(formData.get("nannyId"));
  const positionId = text(formData.get("positionId"));
  if (!UUID.test(nannyId) || !UUID.test(positionId))
    redirect(CONNECTIONS_PATHS.browse);

  const session = await auth.requireRole("parent");
  if (!session.ok) redirect(CONNECTIONS_PATHS.login);

  const moved = await CONNECTIONS_DISPATCH.get()({
    entity: { kind: "connection", id: newId() as ConnectionId },
    transition: "K-1",
    actor: { kind: "user", id: session.value.userId, role: "parent" },
    payload: {
      positionId: positionId as PositionId,
      nannyId: nannyId as NannyId,
    },
    expectedFrom: null,
    idempotencyKey: `K-1:${positionId}:${nannyId}`,
  });

  // 04 §3.3 trigger (c): she lands on the call page, named for the nanny she just asked for. A refusal sends
  // her back to the profile — the cap, the duplicate and the verification floor are all states S-P-07 renders.
  redirect(
    moved.ok
      ? CONNECTIONS_PATHS.call
      : `${CONNECTIONS_PATHS.browse}/${encodeURIComponent(nannyId)}`,
  );
}
