import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { getPosition, PositionWithChildren } from "@/lib/actions/parent";
import {
  getParentPlacement,
  getConfirmedConnections,
  getParentUpcomingIntros,
} from "@/lib/actions/position-funnel";
import { getDfyStatus } from "@/lib/actions/matching";
import { getPendingInvitesForUser } from "@/lib/actions/bapp/child-invites";
import { POSITION_STAGE } from "@/lib/position/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ParentHubClient } from "./ParentHubClient";
import type { ChildClient } from "@/types/bapp";
// S-P-03 (04 §7.1; `04.30`): the steps in motion sit above the carried Sydney hub until `1e` rebuilds the page.
import { ParentJourneyRail, loadParentJourney } from "@/modules/call-layer";
// S-P-13 (`1i`): the children card, and rows 7-8 of the rail. This route file is the one place the gate, the
// money standing and the child-link reads are all legal to reach (01 §2.3) — see `app-rail-facts.ts`.
import { accessGate } from "@/modules/access-gate";
import { ChildrenCard, loadChildrenCard } from "@/modules/app";
import { auth } from "@/modules/auth";
import { appRailFacts } from "./app-rail-facts";
import { familyRead } from "./family-read";

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true";

export default async function ParentHubPage({
  searchParams,
}: {
  searchParams: { t?: string; s?: string; v?: string };
}) {
  let position: PositionWithChildren | null = null;
  let error: string | null = null;

  if (!isDevMode) {
    const result = await getPosition();
    position = result.data ?? null;
    error = result.error ?? null;
  }

  // Get auth user for education children query
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();

  // The gate, once. `hasAccess` fails closed by carrying `payments`' error rather than defaulting to
  // `open: false` (`1h`), so a refusal here becomes `null` — "we could not tell" — and the card renders the
  // outage state rather than a paywall. Flattening the two would bill a paying family for a database blip.
  // ★ M-15 (REVIEW-2): a failed session read used to fold into the same `null` as a signed-out visitor, skip
  // the gate and render the logged-out page with no log. `familyRead` keeps the three answers apart.
  const session = familyRead(await auth.getCurrentUserId());
  if (session.kind === "unavailable")
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <p className="text-amber-700">
              We can&rsquo;t load your app just now. Try again shortly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  const familyId = session.kind === "family" ? session.familyId : null;
  const gate = familyId === null ? null : await accessGate.hasAccess(familyId);
  const access = gate !== null && gate.ok ? gate.value : null;

  const [journey, childrenCard] = await Promise.all([
    loadParentJourney(
      familyId === null || access === null
        ? undefined
        : await appRailFacts({
            familyId,
            access,
            standing: access.state.state,
            ...(access.state.state === "placed"
              ? {
                  appOnFrom: access.state.startedAt,
                  paymentDueAt: access.state.paymentDueAt,
                }
              : {}),
          }),
    ),
    loadChildrenCard(access),
  ]);

  const [
    placementResult,
    connectionsResult,
    introsResult,
    dfyStatusResult,
    educationChildrenRes,
    pendingInvitesResult,
  ] = await Promise.all([
    getParentPlacement(),
    position?.id
      ? getConfirmedConnections(position.id)
      : Promise.resolve({ data: [], error: null }),
    getParentUpcomingIntros(),
    getDfyStatus(),
    user
      ? admin
          .from("child_client")
          .select("*")
          .eq("parent_user_id", user.id)
          .eq("under_three", true)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    user ? getPendingInvitesForUser() : Promise.resolve({ data: [] }),
  ]);

  const placement = placementResult.data;
  const confirmedNannies = connectionsResult.data;
  const upcomingIntros = introsResult.data;
  const dfyTier = dfyStatusResult.tier;
  const dfyExpiresAt = dfyStatusResult.expiresAt;
  const dfyActivated = dfyStatusResult.activated;
  const showFillButton =
    position &&
    !placement &&
    (position as PositionWithChildren & { stage?: number }).stage ===
      POSITION_STAGE.CONNECTING &&
    confirmedNannies.length > 0;

  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <ParentJourneyRail
        steps={journey.kind === "steps" ? journey.steps : []}
        failed={journey.kind !== "steps"}
      />
      {childrenCard === null ? null : <ChildrenCard view={childrenCard} />}
      <ParentHubClient
        position={position}
        placement={placement}
        confirmedNannies={confirmedNannies}
        showFillButton={!!showFillButton}
        upcomingIntros={upcomingIntros}
        dfyTier={dfyTier}
        dfyExpiresAt={dfyExpiresAt}
        dfyActivated={dfyActivated}
        initialTab={searchParams.t}
        initialSub={searchParams.s}
        initialView={searchParams.v}
        educationChildren={(educationChildrenRes.data ?? []) as ChildClient[]}
        pendingInvites={pendingInvitesResult.data ?? []}
      />
    </div>
  );
}
