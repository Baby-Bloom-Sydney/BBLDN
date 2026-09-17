// S-P-01 — `/parent/call` (04 §2.2): the call page after signup, after a self-serve Connect, after a child-invite
// claim (04 §3.3 triggers a · b · c · E). Thin by rule (05 §7 rule 5): one connector, one read, render. Signed
// out → login (defence in depth behind the middleware gate); no open call → the dashboard, which is where a
// parent lands anyway (04 §3.1 step 10).
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTE_MAP, loginRedirectUrl } from "@/modules/auth";
import {
  CallPage,
  CallUnavailable,
  chooseSlotAction,
  holdSlotAction,
  listSlotsAction,
  loadCallPage,
} from "@/modules/call-layer";

export const metadata: Metadata = {
  title: "Your matchmaker will call you",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ACTIONS = Object.freeze({
  hold: holdSlotAction,
  choose: chooseSlotAction,
  list: listSlotsAction,
});

export default async function ParentCallPage() {
  const load = await loadCallPage();
  if (load.kind === "signed-out") redirect(loginRedirectUrl("/parent/call"));
  if (load.kind === "no-call") redirect(ROUTE_MAP.dashboards.parent);
  if (load.kind === "failed")
    return <CallUnavailable dashboardHref={ROUTE_MAP.dashboards.parent} />;
  return (
    <CallPage
      view={load.view}
      days={load.days}
      actions={ACTIONS}
      dashboardHref={ROUTE_MAP.dashboards.parent}
    />
  );
}
