// `GET /api/health` — the uptime probe's endpoint (06 §7; ADR-106 names Better Stack). Deliberately the least
// informative route in the app: no version, no commit, no environment, no dependency check, no request id
// echoed back. A health endpoint is unauthenticated by definition, so anything it returns is public.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ status: "ok" }, { status: 200 });
}
