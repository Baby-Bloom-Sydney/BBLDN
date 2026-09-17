import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BAppLayout } from "@/components/bapp/BAppLayout";
import { InviteBanner } from "@/components/bapp/InviteBanner";
import { getInviteForChild } from "@/lib/actions/bapp/child-invites";
import { accessGate } from "@/modules/access-gate";
import { AppGateNotice, appAccessView, childAppGate } from "@/modules/app";
import type { FamilyId } from "@/modules/shared-types";
import { hasParentMediaConsent } from "@/lib/legal/media-consent-gate";
import { ConsentRenewalModal } from "@/components/legal/ConsentRenewalModal";
import type { ChildClient } from "@/types/bapp";

export default async function ParentDevelopmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { childId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const admin = createAdminClient();

  // Fetch child and verify access
  const { data: child, error } = await admin
    .from("child_client")
    .select("*")
    .eq("id", params.childId)
    .single();

  if (error || !child) redirect("/parent");

  // Verify parent has access
  const c = child as ChildClient;
  if (c.parent_user_id !== user.id) {
    redirect("/parent");
  }

  // Banner shows when the parent created the invite (parent_to_nanny)
  // and the nanny hasn't claimed it yet. getInviteForChild gates on
  // creator-only access, so a child with a nanny-created invite won't
  // expose the token here.
  const showBanner = c.nanny_user_id === null;
  const inviteResult = showBanner ? await getInviteForChild(c.id) : null;

  // `07.09` / `07.59` — the London gate, three-valued. `accessGate.hasAccess` fails closed by carrying
  // `payments`' error rather than defaulting to `open: false` (`1h`), so `unknown` is a real state here and it
  // is **not** the paywall: a family that has paid, shown a demand for money because the database blinked,
  // learns something false about her own account. The Sydney `requireChildFamilyAccess` this replaces could
  // not express that — it answered a boolean and a lapse reason, so every outage read as a lapse.
  const familyUserId = c.parent_user_id as string | null;
  const decision =
    familyUserId === null
      ? null
      : await accessGate.hasAccess(familyUserId as string as FamilyId);
  const access = decision !== null && decision.ok ? decision.value : null;
  const gate = childAppGate(access);

  if (gate.kind !== "open") {
    const view = appAccessView({ access, children: [] });
    if (view.kind !== "open")
      return (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <AppGateNotice view={view} />
        </main>
      );
  }

  // T-015 — check whether the parent's media consent is within the
  // T-7d renewal window or already expired. If so, render the
  // ConsentRenewalModal alongside the page content.
  const mediaConsentGate = await hasParentMediaConsent(
    { childId: c.id },
    { admin },
  );
  const showRenewalModal =
    mediaConsentGate.state === "nearing_expiry" ||
    mediaConsentGate.state === "expired";

  // Fetch nanny first name. UX-FIX-PLAN FIX-9 (2026-05-12 audit):
  // previously only fetched when access was lapsed (for the modal
  // copy); now fetched whenever a nanny is linked so the layout can
  // surface "Following with [Nanny]" on the parent side and make the
  // relational frame visible — not just during paywall moments.
  let nannyFirstName: string | undefined;
  if (c.nanny_user_id) {
    const { data: nannyProfile } = await admin
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", c.nanny_user_id)
      .maybeSingle<{ first_name: string | null }>();
    nannyFirstName = nannyProfile?.first_name ?? undefined;
  }

  return (
    <BAppLayout
      child={c}
      role="parent"
      familyHasAccess={gate.kind === "open"}
      nannyFirstName={nannyFirstName}
      lapseReason={
        gate.kind === "closed" && gate.reason === "lapsed"
          ? "trial_ended"
          : "subscription_lapsed"
      }
    >
      {inviteResult?.success && inviteResult.data && (
        <InviteBanner
          childId={c.id}
          childFirstName={c.first_name ?? "your child"}
          inviteToken={inviteResult.data.token}
          role="parent"
        />
      )}
      {children}
      {showRenewalModal && mediaConsentGate.expiresAt && (
        <ConsentRenewalModal
          childId={c.id}
          childFirstName={c.first_name ?? "your child"}
          role="parent"
          expiresAt={mediaConsentGate.expiresAt}
        />
      )}
    </BAppLayout>
  );
}
