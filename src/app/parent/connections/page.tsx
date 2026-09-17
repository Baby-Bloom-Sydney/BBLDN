// S-P-08 — `/parent/connections` (04 §2.2, §6.2): every nanny this family asked for and where each one stands.
// Thin by rule (05 §7 rule 5): one connector, one read, render.
//
// The Sydney redirect that stood here is gone: the screen it pointed away from now exists.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loginRedirectUrl } from "@/modules/auth";
import {
  ParentConnections,
  loadParentConnections,
} from "@/modules/connections";

export const metadata: Metadata = {
  title: "Your nannies",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ParentConnectionsPage() {
  const load = await loadParentConnections();
  if (load.kind === "signed-out")
    redirect(loginRedirectUrl("/parent/connections"));
  if (load.kind === "failed")
    return <ParentConnections cards={[]} failed={true} />;
  return <ParentConnections cards={load.cards} />;
}
