// The preview card (S-X-02 · S-X-04 · S-X-10): first name, area label through `formatAreaLabel` (03 §6.3
// rule 6), the DBS badge, experience, qualification, the score when ranked, distance when known, and — through
// the parent's `children` slot — the actions the screen owns (a Connect form, a profile link). No rate, ever.
import Image from "next/image";
import Link from "next/link";
import { formatAreaLabel } from "@/modules/areas";
import type { Ranked } from "@/modules/scoring";
import type { PublicNanny } from "../types";
import { FUNNEL_PATHS } from "../lib/funnel-paths";
import { DbsBadge } from "./DbsBadge";

export type NannyPreviewCardProps = {
  readonly nanny: PublicNanny;
  readonly ranked?: Ranked;
  readonly profileQuery?: string;
  /** S-X-10 for a signed-in parent: the card links to S-P-07 instead of S-X-11. */
  readonly profileHref?: string;
  readonly children?: React.ReactNode;
  readonly blurred?: boolean;
};

const years = (count: number | null): string | null =>
  count === null || count <= 0
    ? null
    : `${count} ${count === 1 ? "year" : "years"} experience`;

export function NannyPreviewCard({
  nanny,
  ranked,
  profileQuery,
  profileHref,
  children,
  blurred,
}: NannyPreviewCardProps) {
  const href =
    profileHref ??
    `${FUNNEL_PATHS.nannyProfile}/${encodeURIComponent(nanny.nannyId)}${profileQuery ?? ""}`;
  const experience = years(nanny.yearsExperience);
  return (
    <article
      aria-labelledby={`nanny-${nanny.nannyId}`}
      aria-hidden={blurred ? true : undefined}
      className={`relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${blurred ? "pointer-events-none select-none blur-sm" : ""}`}
    >
      {ranked !== undefined ? (
        <span className="absolute right-3 top-3 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
          {ranked.score}% match
        </span>
      ) : null}
      <div className="h-14 bg-gradient-to-br from-violet-50 to-violet-100/60" />
      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="-mt-8 flex items-end gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-white bg-violet-50 shadow-md">
            {nanny.photoUrl !== null ? (
              <Image
                src={nanny.photoUrl}
                alt=""
                width={80}
                height={80}
                unoptimized
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-full w-full items-center justify-center text-2xl font-bold text-violet-300"
              >
                {nanny.firstName.charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0 pb-1">
            <h3
              id={`nanny-${nanny.nannyId}`}
              className="truncate text-xl font-bold text-slate-900"
            >
              {nanny.firstName}
            </h3>
            <p className="truncate text-sm text-slate-500">
              {formatAreaLabel({
                name: nanny.area.area,
                district: nanny.area.district,
              })}
              {ranked?.distanceKm !== undefined &&
              ranked.distanceKm !== null ? (
                <span className="text-slate-400">
                  {" "}
                  ·{" "}
                  {ranked.distanceKm < 1
                    ? "under 1 km"
                    : `${ranked.distanceKm} km`}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <DbsBadge level={nanny.verificationLevel} compact />
          {experience !== null ? (
            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
              {experience}
            </span>
          ) : null}
          {nanny.qualification !== null ? (
            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
              {nanny.qualification}
            </span>
          ) : null}
        </div>
        {nanny.bio !== null ? (
          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-600">
            {nanny.bio}
          </p>
        ) : null}
        <div className="mt-auto flex items-center gap-3 pt-4">
          <Link
            href={href}
            className="text-sm font-medium text-violet-600 underline-offset-4 hover:underline"
          >
            See {nanny.firstName}&apos;s profile
          </Link>
          {children}
        </div>
      </div>
    </article>
  );
}
