// `/api/admin/pipeline-snapshots` — the admin pipeline read (S-A-12, `09.07`).
//
// **This route replaces a pre-existing Sydney one that had no auth check at all** and used a service-role
// client; `middleware.ts` only refreshes the session, so any caller could read the whole funnel. 07 §5.4 row 1
// requires the admin role to be re-checked in every admin surface, not only in middleware, and `requireRole`
// also enforces `aal2` (row 2). Thin by rule (01 §2.5): gate, then delegate.
//
// The read itself is not built: `admin/pipeline` reads `platform`'s `queryEvents` / `countByName` and 02's views
// (fix: A-24), and neither the `events` table nor `pipeline_snapshots` is wired yet — so this answers an explicit
// error rather than an empty list, which would read as "the pipeline is empty".
import { auth } from "@/modules/auth";
import { err, toResponse } from "@/modules/platform";
import { requestIdOf } from "@/app/api/_lib/request-id";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdOf(request);
  const session = await auth.requireRole("admin");
  if (!session.ok) return toResponse(session, { requestId });

  return toResponse(
    err("INTERNAL", "No handler is registered for this read", {
      reason: "no-handler-registered",
    }),
    { requestId },
  );
}
