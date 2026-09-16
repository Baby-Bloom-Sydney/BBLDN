// S-A-03 / S-A-04 — the call queue and the one live admin calendar on a single screen (ADR-074; 04 §6.4).
// Route shell only: the panel's inside reads `scheduling.listSchedule` / `block` / `unblock` /
// `setAvailabilityRule` and `call-layer`, none of which has an inside yet.
//
// Thin by rule (01 §2.5): the page gates on the admin role through `auth` — the middleware is the coarse gate,
// not the only one (07 §5.4 row 1) — and renders. `requireRole('admin')` also requires `aal2` (row 2).
import { notFound } from "next/navigation";
import { auth } from "@/modules/auth";
import { CALL_QUEUE_PANEL } from "@/modules/admin";

export const dynamic = "force-dynamic";

export default async function AdminCallsPage() {
  const session = await auth.requireRole("admin");
  if (!session.ok) notFound();

  return (
    <main aria-labelledby="admin-calls-heading">
      <h1 id="admin-calls-heading">Call queue</h1>
      <p>
        {CALL_QUEUE_PANEL.screens.join(" · ")} — not built yet. The queue, the
        calendar and the call drawer land with the scheduling and call-layer
        insides.
      </p>
    </main>
  );
}
