// `POST /api/agent` — the Recruitment Agent's route (`04.10`; 01 §4e "the caller is not a browser session").
//
// **Fail closed.** Bearer `ADMIN_API_TOKEN`, absent-token-rejects, constant-time compare — the same rule as the
// crons, in the same one place (`authorise-bearer.ts`). 07 §5.4 row 4: the token is scoped to this route and is
// **never** accepted on `/admin`; 07 §8 row 9 caps it at 60/min with `source = agent` on what it creates.
//
// The inside is not built: positions are created through `positions`' stage-model connector, whose write path
// lands in Phase 1. It answers an explicit error rather than a 202 that would read as "your position is queued".
import { env } from "@/modules/config/server";
import { err, log, toResponse } from "@/modules/platform";
import { authoriseBearer } from "@/app/api/_lib/authorise-bearer";
import { requestIdOf } from "@/app/api/_lib/request-id";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdOf(request);
  if (
    !authoriseBearer(
      request.headers.get("authorization"),
      env.server.ADMIN_API_TOKEN,
    )
  ) {
    log.warn("agent request rejected: bad or missing bearer", {
      requestId,
      action: "agent",
    });
    return toResponse(
      err("UNAUTHENTICATED", "Unauthorised", { reason: "bad-admin-token" }),
      { requestId },
    );
  }

  return toResponse(
    err("INTERNAL", "No handler is registered for this route", {
      reason: "no-handler-registered",
    }),
    { requestId },
  );
}
