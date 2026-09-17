// S-X-10 — browse nannies (04 §6.1; `01.17` / `02.14`): every marketplace-safe nanny, most experienced first,
// the DBS badge on each; "Try Free Matchmaking" stays — the lead magnet (ADR-056, glossary §6 scoped exception)
// — and points at S-X-03. A signed-in parent's cards lead to S-P-07, where the in-app Connect lives; a guest's to
// S-X-11. Empty is a plain line and one action, never blank (04 §6 states convention).
import Link from "next/link";
import { FUNNEL_PATHS, NannyPreviewCard } from "@/modules/matching";
import type { PublicNanny } from "@/modules/matching";
import type { BrowseNanniesProps } from "../types";

const primary =
  "inline-flex h-12 items-center justify-center rounded-md bg-violet-500 px-6 text-base font-medium text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2";

const byExperience = (left: PublicNanny, right: PublicNanny): number =>
  (right.yearsExperience ?? 0) - (left.yearsExperience ?? 0) ||
  left.firstName.localeCompare(right.firstName);

export function BrowseNannies({
  nannies,
  viewer,
  serviceAreaName,
  matchmakingHref,
  failed,
}: BrowseNanniesProps) {
  const sorted = [...nannies].sort(byExperience);
  return (
    <section
      aria-labelledby="browse-heading"
      className="container mx-auto px-4 py-12 md:px-6 md:py-16"
    >
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase [letter-spacing:0.2em] text-violet-500">
          {serviceAreaName}
        </p>
        <h1
          id="browse-heading"
          className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl"
        >
          Nannies near you
        </h1>
        <p className="mt-3 text-lg text-slate-600">
          Every nanny here is identity-checked and holds an Enhanced DBS. Tell
          us about your family and your matchmaker will call to introduce you to
          your top nannies.
        </p>
        <Link href={matchmakingHref} className={`${primary} mt-6`}>
          Try Free Matchmaking
        </Link>
      </div>
      {failed ? (
        <p
          role="alert"
          className="mt-10 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          We couldn&apos;t load the nannies just now.{" "}
          <Link href="/nannies" className="font-medium underline">
            Try again
          </Link>
        </p>
      ) : sorted.length === 0 ? (
        <p className="mt-10 text-slate-600">
          Nannies near you are being added. Tell us about your family and your
          matchmaker will find you one.
        </p>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((nanny) => (
            <NannyPreviewCard
              key={nanny.nannyId}
              nanny={nanny}
              profileHref={
                viewer === "parent"
                  ? `${FUNNEL_PATHS.parentBrowse}/${encodeURIComponent(nanny.nannyId)}`
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
