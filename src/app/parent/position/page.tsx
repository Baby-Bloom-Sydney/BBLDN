// S-P-05 — `/parent/position` (04 §2.2, §6.2): what the family asked for, where it stands (`04.09` status codes
// v2), and the one lever a parent holds on her own position (P-7). Thin by rule (05 §7 rule 5): one connector,
// one read, render.
//
// Signed out → login (defence in depth behind the middleware gate); no position yet → the dashboard, where the
// "create your position" card lives (04 §7.1 state 0). The confirmed connections, the meetings and the
// placement card 04 §6.2 also names read the K and L stages and land with `1f` / `1g` — recorded, not faked.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTE_MAP, loginRedirectUrl } from "@/modules/auth";
import {
  PositionPage,
  closePositionAction,
  loadPositionPage,
} from "@/modules/positions";
import type { PositionId, PositionStage } from "@/modules/shared-types";

export const metadata: Metadata = {
  title: "What you asked for",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ROUTE = "/parent/position";

export default async function ParentPositionPage() {
  const load = await loadPositionPage();
  if (load.kind === "signed-out") redirect(loginRedirectUrl(ROUTE));
  if (load.kind === "no-position") redirect(ROUTE_MAP.dashboards.parent);
  if (load.kind === "failed") redirect(ROUTE_MAP.dashboards.parent);

  const positionId: PositionId = load.positionId;
  async function close(formData: FormData): Promise<void> {
    "use server";
    await closePositionAction({
      positionId,
      expectedFrom: String(formData.get("expectedFrom")) as PositionStage,
    });
    redirect(ROUTE_MAP.dashboards.parent);
  }

  return (
    <PositionPage view={load.view} stage={load.stage} closeAction={close} />
  );
}
