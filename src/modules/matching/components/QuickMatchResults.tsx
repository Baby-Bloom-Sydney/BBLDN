// S-X-02 — quick-match results (04 §3.1 step 2; 04 §6.1): "N nannies near {area}" and three preview cards with
// the DBS badge; the CTA routes to signup, never to a guest Connect (04 §3.2 path A / B.2); a card's Connect is
// the T-1.8d guest road (04 §3.3 (d)); "advanced" goes to S-X-03. The no-match line is a stop state: its
// heading takes focus and the line is announced (fix: a11y-13); error carries a retry control (fix: a11y-15).
"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatAreaLabel } from "@/modules/areas";
import type { QuickMatchPage } from "../types";
import { FUNNEL_PATHS } from "../lib/funnel-paths";
import { NannyPreviewCard } from "./NannyPreviewCard";
import { ConnectButton } from "./ConnectButton";

export type QuickMatchResultsProps = {
  readonly page: QuickMatchPage;
  readonly connectAction: (formData: FormData) => Promise<never>;
  readonly serviceAreaName: string;
  readonly retryHref: string;
};

const primary =
  "inline-flex h-12 items-center justify-center rounded-md bg-violet-500 px-6 text-base font-medium text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2";
const secondary =
  "inline-flex h-12 items-center justify-center rounded-md border border-slate-300 px-6 text-base font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2";

export function QuickMatchResults({
  page,
  connectAction,
  serviceAreaName,
  retryHref,
}: QuickMatchResultsProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (page.kind !== "matches") heading.current?.focus();
  }, [page.kind]);

  if (page.kind === "error")
    return (
      <section aria-labelledby="results-heading" role="alert">
        <h1
          ref={heading}
          id="results-heading"
          tabIndex={-1}
          className="text-2xl font-bold text-slate-900"
        >
          We couldn&apos;t load your matches
        </h1>
        <p className="mt-2 text-slate-600">
          Something went wrong on our side. Try again in a moment.
        </p>
        <Link href={retryHref} className={`${secondary} mt-6`}>
          Try again
        </Link>
      </section>
    );

  if (page.kind === "no-match")
    return (
      <section aria-labelledby="results-heading" aria-live="polite">
        <h1
          ref={heading}
          id="results-heading"
          tabIndex={-1}
          className="text-2xl font-bold text-slate-900"
        >
          We cover {serviceAreaName} — nannies near you are being added
        </h1>
        <p className="mt-2 max-w-xl text-slate-600">
          {page.area !== null
            ? `We don't have a nanny near ${formatAreaLabel({ name: page.area.area, district: page.area.district })} on those days yet.`
            : "We didn't recognise that postcode district."}{" "}
          Tell us about your family and your matchmaker will find you one.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={FUNNEL_PATHS.onboarding} className={primary}>
            Tell us about your family
          </Link>
          <Link href="/" className={secondary}>
            Change your area or days
          </Link>
        </div>
      </section>
    );

  const areaLabel = formatAreaLabel({
    name: page.area.area,
    district: page.area.district,
  });
  return (
    <section aria-labelledby="results-heading">
      <p className="text-xs font-semibold uppercase [letter-spacing:0.2em] text-violet-500">
        Your matches
      </p>
      <h1
        id="results-heading"
        className="mt-2 text-3xl font-bold text-slate-900"
      >
        {page.total} {page.total === 1 ? "nanny" : "nannies"} near {areaLabel}
      </h1>
      <p className="mt-2 max-w-xl text-slate-600">
        Every one is identity-checked and holds an Enhanced DBS. Here are your
        top three — your matchmaker will call to introduce you to the ones who
        are available and keen.
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {page.cards.map((card) => (
          <NannyPreviewCard
            key={card.nanny.nannyId}
            nanny={card.nanny}
            ranked={card.ranked}
            profileQuery={`?${FUNNEL_PATHS.query.src}=std`}
          >
            <ConnectButton
              action={connectAction}
              nannyId={card.nanny.nannyId}
              surface="results"
            />
          </NannyPreviewCard>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Link
          href={`${FUNNEL_PATHS.signup}?${FUNNEL_PATHS.query.src}=std`}
          className={primary}
        >
          Connect with best matches
        </Link>
        <Link href={FUNNEL_PATHS.onboarding} className={secondary}>
          Refine with a few more questions
        </Link>
      </div>
    </section>
  );
}
