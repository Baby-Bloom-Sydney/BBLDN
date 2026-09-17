// S-P-10 — `/parent/bundle` (04 §2.2, §6.2). Thin by rule (05 §7 rule 5): one connector, one read, render.
//
// It sits **inside the app, after the call**: no amount is shown before the call (D2), and the route is behind
// the parent gate. A signed-out visitor goes to login (defence in depth behind the middleware gate); a failed
// read goes to the dashboard rather than rendering "nothing to pay", because an outage must never read to a
// paying family as a closed account.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTE_MAP, loginRedirectUrl } from "@/modules/auth";
import { BundlePage, loadMoneyPage } from "@/modules/payments";

export const metadata: Metadata = {
  title: "Your bundle",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ROUTE = "/parent/bundle";

export default async function ParentBundlePage() {
  const load = await loadMoneyPage();
  if (load.kind === "signed-out") redirect(loginRedirectUrl(ROUTE));
  if (load.kind === "failed") redirect(ROUTE_MAP.dashboards.parent);
  return <BundlePage view={load.view} />;
}
