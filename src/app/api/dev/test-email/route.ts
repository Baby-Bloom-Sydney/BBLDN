// `GET /api/dev/test-email` — 03 §8.2 row 41; `08.19`. The wiring check run **first** once the London sending
// domain is verified in Resend: it proves the key, the domain, the `from` mailbox, the template seam and the
// `email_logs` row in one call, before any journey mail depends on any of them.
//
// **Three properties keep it from being a spam lever**, and they are the reason it takes no input at all:
//   1. it 404s outside development — as if the route did not exist (the `stub-purchase` pattern; ADR-108);
//   2. `auth.requireRole('admin')` also requires `aal2` (07 §5.4 row 2), so the middleware gate is not the only one;
//   3. **the recipient is not a parameter.** It is `SENDERS.admin` from `config` — there is no body, no query and
//      no way to aim this at a third party, which is what a "send a test email to X" endpoint always becomes.
//
// It reports what `comms` answered rather than swallowing it: a refusal here is the finding (a missing key, an
// unverified domain, a template with no file), and an endpoint whose whole job is diagnosis must not hide one.
import { auth } from "@/modules/auth";
import { comms } from "@/modules/comms";
import { env, SENDERS } from "@/modules/config/server";
import { nowInstant, toResponse } from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import { requestIdOf } from "@/app/api/_lib/request-id";

export const dynamic = "force-dynamic";

const NOT_FOUND = 404;

export async function GET(request: Request): Promise<Response> {
  if (env.environment === "production")
    return new Response(null, { status: NOT_FOUND });

  const requestId = requestIdOf(request);
  const session = await auth.requireRole("admin");
  if (!session.ok) return toResponse(session, { requestId });

  const sent = await comms.send({
    channel: "email",
    templateId: "admin-test",
    to: { email: SENDERS.admin.address as Email, name: SENDERS.admin.name },
    data: { at: nowInstant(), environment: env.environment },
  });
  return toResponse(sent, { requestId });
}
