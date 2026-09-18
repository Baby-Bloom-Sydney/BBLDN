// `/admin/erasure` (07 §6.1; B-46) — where an Art 17 request that arrived by email is recorded and run. Thin by
// rule (05 §7 rule 5): one read, one component, both actions as props.
//
// The gate is in `loadErasureRequests` and in each action, not here and not in the layout: `src/app/admin/layout.tsx`
// carries no auth guard at all (measured), so a page that trusted it would be gated by the middleware and by
// nothing else (07 §5.4 rows 1–2).
import { redirect } from "next/navigation";
import {
  ErasurePanel,
  loadErasureRequests,
  openErasureRequestAction,
  runErasureRequestAction,
} from "@/modules/admin";

export const dynamic = "force-dynamic";

export default async function AdminErasurePage() {
  const loaded = await loadErasureRequests();
  if (!loaded.ok) redirect("/login");
  return (
    <main>
      <h1>Account erasure</h1>
      <ErasurePanel
        requests={loaded.value}
        openAction={openErasureRequestAction}
        runAction={runErasureRequestAction}
      />
    </main>
  );
}
