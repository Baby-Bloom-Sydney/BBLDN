// Admin "view as" — a nanny's verification as she sees it (S-N-09's page, read-only for the admin; the queue
// with decisions is S-A-16, `2c`). Replaces the Sydney viewer that read WWCC columns the London schema never
// had. The read is `verification.getStatus`, which the `verification_status` view answers for an admin too.
import { notFound, redirect } from "next/navigation";
import { auth } from "@/modules/auth";
import type { UserId } from "@/modules/shared-types";
import { VerificationStatusPage, verification } from "@/modules/verification";

export const dynamic = "force-dynamic";

export default async function AdminViewerVerificationPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth.requireRole("admin");
  if (!session.ok) redirect("/login");
  const state = await verification.getStatus(params.id as UserId);
  if (!state.ok) notFound();
  return (
    <VerificationStatusPage
      state={state.value}
      hrefs={{ wizard: "/admin/verifications", hub: "/admin/users" }}
    />
  );
}
