// `01.21` — the nanny OG image (nanny v1 kept). Thin by rule: the one read, then the builder; 404 when the
// nanny is not visible (the same predicate as the profile — an isolated or hidden nanny has no image either).
import { matching } from "@/modules/matching";
import { nannyOgImage } from "@/modules/public-site";
import type { NannyId } from "@/modules/shared-types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { readonly params: { readonly id: string } },
) {
  const nanny = await matching.getPublicNanny(params.id as NannyId);
  if (!nanny.ok || nanny.value === null)
    return new Response(null, { status: 404 });
  return nannyOgImage(nanny.value);
}
