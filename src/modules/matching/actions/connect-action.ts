"use server";
// ADR-126 — the one Connect entry point `public-site` calls, as a form action so it works without a script. Reads
// the session itself (01 §4d: the server decides, never the client), asks `matching.connect`, and redirects to
// where the decision points (04 §3.3 (d)). A malformed id goes back to browse rather than erroring.
import { redirect } from "next/navigation";
import { auth } from "@/modules/auth";
import type { LeadId, NannyId } from "@/modules/shared-types";
import type { ConnectSurface } from "../types";
import { matching } from "../lib/default-matching";
import { FUNNEL_PATHS } from "../lib/funnel-paths";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SURFACES: ReadonlySet<string> = new Set(["results", "matches", "browse"]);

const text = (value: FormDataEntryValue | null): string =>
  typeof value === "string" ? value.trim() : "";

export async function connectAction(formData: FormData): Promise<never> {
  const nannyId = text(formData.get("nannyId"));
  const surface = text(formData.get("surface"));
  const leadId = text(formData.get("leadId"));
  if (!UUID.test(nannyId) || !SURFACES.has(surface))
    redirect(FUNNEL_PATHS.nannyProfile);
  const session = await auth.getSession();
  const decision = await matching.connect({
    nannyId: nannyId as NannyId,
    surface: surface as ConnectSurface,
    session: session.ok ? session.value : null,
    leadId: UUID.test(leadId) ? (leadId as LeadId) : null,
  });
  redirect(decision.ok ? decision.value.to : FUNNEL_PATHS.nannyProfile);
}
