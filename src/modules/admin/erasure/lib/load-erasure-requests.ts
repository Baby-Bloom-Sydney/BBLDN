// The panel's one read: every Art 17 request still open. Admin-gated here as well as at the edge, for the reason
// `require-admin.ts` gives — `src/app/admin/layout.tsx` carries no guard.
//
// The list carries **no name and no email**. An open request is about a person who has asked to be forgotten, and
// a screen that listed her details would be the one place her identity was gathered up and displayed precisely
// because she asked us to stop holding it. The id is what the second step needs and the only thing it shows.
import { privacy } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { ErasureActionDetails, ErasureRequestRow } from "../types";
import { requireAdmin } from "./require-admin";

const LIMIT = 50;

export async function loadErasureRequests(): Promise<
  Result<ReadonlyArray<ErasureRequestRow>, ErasureActionDetails>
> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const listed = await privacy.listOpenRequests(LIMIT);
  if (!listed.ok) return admin.ok ? { ok: true, value: [] } : admin;
  return {
    ok: true,
    value: listed.value.map((request) =>
      Object.freeze({
        requestId: request.requestId,
        subjectUserId: request.subjectUserId,
        road: request.road,
        requestedAt: String(request.requestedAt),
      }),
    ),
  };
}
