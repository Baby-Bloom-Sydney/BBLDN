// S-A-29 — the guarantees ledger (ADR-088 / 092; 04 §6.4). Route shell only: every G1–G5 claim, the condition
// met, the payout **by hand** and the dates read `guarantee_events` through the `admin/guarantees` connector.
// There is no payout automation (N-2, ADR-022) and no nanny bonus (ADR-099).
//
// Thin by rule (01 §2.5): gate on the admin role through `auth` (07 §5.4 rows 1–2), then render.
import { notFound } from "next/navigation";
import { auth } from "@/modules/auth";
import { GUARANTEES_PANEL } from "@/modules/admin";

export const dynamic = "force-dynamic";

export default async function AdminGuaranteesPage() {
  const session = await auth.requireRole("admin");
  if (!session.ok) notFound();

  return (
    <main aria-labelledby="admin-guarantees-heading">
      <h1 id="admin-guarantees-heading">Guarantees</h1>
      <p>
        {GUARANTEES_PANEL.screens.join(" · ")} — not built yet. The ledger lands
        with the `guarantee_events` reads; payouts stay by hand.
      </p>
    </main>
  );
}
