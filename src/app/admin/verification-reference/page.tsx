// S-A-17 `/admin/verification-reference` (04 §6.4) — the admin's crib, rendered from the enums and the config by
// `admin-verification` (the Sydney page listed NSW WWCC / OCG codes the London schema never carried). Thin by
// rule: gate on the admin role, render.
import { notFound } from "next/navigation";
import { VerificationReference } from "@/modules/admin-verification";
import { auth } from "@/modules/auth";
import { MATCHING } from "@/modules/config";

export const dynamic = "force-dynamic";

export default async function AdminVerificationReferencePage() {
  const session = await auth.requireRole("admin");
  if (!session.ok) notFound();
  return (
    <main aria-labelledby="reference-heading">
      <VerificationReference minVerificationLevel={MATCHING.minVerificationLevel} />
    </main>
  );
}
