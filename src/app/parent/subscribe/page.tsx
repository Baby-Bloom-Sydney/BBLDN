// S-P-11 — `/parent/subscribe` (04 §2.2, §6.2): the self-serve road into the app. Thin by rule (05 §7 rule 5).
//
// This replaces the Sydney page, which read `@/lib/supabase` directly against Sydney columns, revealed the
// amounts up front and carried a trial banner using the very word ADR-082 rules out. None of that survives
// contact with that ruling or with the London schema.
//
// A family whose bundle is already open is sent to S-P-12: this screen is for taking it, not for reading it.
// `?refused=1` is how a declined card comes back — it names no provider and carries no id.
//
// ADR-144: an empty shape list is an outage. The judgement lives in `selfServeShapes()` so this file stays thin
// (05 §7 rule 5) and so the log line is testable without standing a route up.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTE_MAP, loginRedirectUrl } from "@/modules/auth";
import {
  SelfServePage,
  loadMoneyPage,
  selfServeShapes,
  startCheckoutAction,
} from "@/modules/payments";

export const metadata: Metadata = {
  title: "Your bundle",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ROUTE = "/parent/subscribe";
const ALREADY_OPEN: ReadonlySet<string> = new Set([
  "active",
  "paid-in-full",
  "placed",
]);

export default async function ParentSubscribePage({
  searchParams,
}: {
  searchParams: { readonly refused?: string };
}) {
  const load = await loadMoneyPage();
  if (load.kind === "signed-out") redirect(loginRedirectUrl(ROUTE));
  if (load.kind === "failed") redirect(ROUTE_MAP.dashboards.parent);
  if (ALREADY_OPEN.has(load.view.state)) redirect("/parent/subscription");

  // ADR-144 — the self-serve presets, and an empty answer treated as `E_PROVIDER` rather than as "nothing to
  // pay": `selfServeShapes()` logs `ALERT_PROVIDER_DOWN` and the screen renders the unavailable state.
  const shapes = selfServeShapes();

  async function choose(formData: FormData): Promise<void> {
    "use server";
    const started = await startCheckoutAction({
      shape: String(formData.get("shape")),
      count: Number(formData.get("count")),
    });
    redirect(started.ok ? started.value.url : `${ROUTE}?refused=1`);
  }

  return (
    <SelfServePage
      view={load.view}
      shapes={shapes}
      chooseAction={choose}
      refused={searchParams.refused === "1"}
    />
  );
}
