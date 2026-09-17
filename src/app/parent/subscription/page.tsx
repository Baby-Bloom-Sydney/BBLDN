// S-P-12 — `/parent/subscription` (04 §2.2, §6.2): where the bundle stands, and the levers a parent holds.
// Thin by rule (05 §7 rule 5). Replaces the Sydney page and its 391-line client, plus the `/cancel` sub-route,
// which captured a cancellation reason into Sydney columns and offered a self-serve end to a service whose
// promise is "tell us and we'll make it right" (a refund is never self-serve — money-model).
//
// RECORDED CONTRADICTION: 03 §5.2 says of `portal` that "cancellation stays in-app", but `PurchasePath` has no
// cancel method — the document names a behaviour the contract gives no road to. Until it does, stopping the
// monthly payments is the hosted portal's, and the claim is pinned `it.fails` in `payments.screens.test.tsx`.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTE_MAP, loginRedirectUrl } from "@/modules/auth";
import {
  BundleStatusPage,
  loadMoneyPage,
  openPortalAction,
} from "@/modules/payments";

export const metadata: Metadata = {
  title: "Your bundle",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ROUTE = "/parent/subscription";

export default async function ParentSubscriptionPage() {
  const load = await loadMoneyPage();
  if (load.kind === "signed-out") redirect(loginRedirectUrl(ROUTE));
  if (load.kind === "failed") redirect(ROUTE_MAP.dashboards.parent);

  const manageable = load.view.action.kind === "manage";

  async function portal(): Promise<void> {
    "use server";
    const opened = await openPortalAction();
    redirect(opened.ok ? opened.value.url : ROUTE);
  }

  return (
    <BundleStatusPage
      view={load.view}
      portalAction={manageable ? portal : null}
    />
  );
}
