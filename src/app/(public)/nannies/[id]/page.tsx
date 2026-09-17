// S-X-11 — the public nanny profile (04 §6.1). Thin by rule: the one read, who is looking, the funnel query.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/modules/auth";
import { URLS } from "@/modules/config";
import { connectAction, matching } from "@/modules/matching";
import {
  NannyProfile,
  parseFunnelQuery,
  publicPageMetadata,
} from "@/modules/public-site";
import type { NannyId } from "@/modules/shared-types";

export const dynamic = "force-dynamic";

type Props = {
  readonly params: { readonly id: string };
  readonly searchParams: Readonly<
    Record<string, string | string[] | undefined>
  >;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const nanny = await matching.getPublicNanny(params.id as NannyId);
  const base = publicPageMetadata("/nannies/[id]");
  if (!nanny.ok || nanny.value === null) return base;
  const image = `${URLS.app}/api/og/nanny/${encodeURIComponent(params.id)}`;
  return {
    ...base,
    title: `${nanny.value.firstName} — verified nanny in London`,
    alternates: { canonical: `/nannies/${params.id}` },
    openGraph: {
      ...base.openGraph,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default async function NannyProfilePage({
  params,
  searchParams,
}: Props) {
  const [nanny, session] = await Promise.all([
    matching.getPublicNanny(params.id as NannyId),
    auth.getSession(),
  ]);
  if (!nanny.ok || nanny.value === null) notFound();
  const { src, lead } = parseFunnelQuery(searchParams);
  const viewer =
    session.ok && session.value?.role === "parent" ? "parent" : "guest";
  return (
    <main>
      <NannyProfile
        nanny={nanny.value}
        viewer={viewer}
        connectAction={connectAction}
        leadId={lead}
        src={src}
      />
    </main>
  );
}
