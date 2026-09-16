// S-X-04 — pre-auth matches (04 §3.1 step 4; 04 §6.1): "N nannies matched · your top matches", three cards and a
// blurred "+N more, sign up to see all"; "Connect with best matches" → S-X-05 beside the matches; a card's
// Connect is the T-1.8d guest road. Error carries a retry control (fix: a11y-15).
"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { PreAuthPage } from "../types";
import { FUNNEL_PATHS } from "../lib/funnel-paths";
import { NannyPreviewCard } from "./NannyPreviewCard";
import { ConnectButton } from "./ConnectButton";

export type PreAuthResultsProps = {
  readonly page: Exclude<PreAuthPage, { kind: "missing-lead" }>;
  readonly connectAction: (formData: FormData) => Promise<never>;
  readonly retryHref: string;
};

const SHOWN = 3;
const primary =
  "inline-flex h-12 items-center justify-center rounded-md bg-violet-500 px-6 text-base font-medium text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2";
const secondary =
  "inline-flex h-12 items-center justify-center rounded-md border border-slate-300 px-6 text-base font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2";

export function PreAuthResults({
  page,
  connectAction,
  retryHref,
}: PreAuthResultsProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (page.kind === "error") heading.current?.focus();
  }, [page.kind]);

  if (page.kind === "error")
    return (
      <section aria-labelledby="matches-heading" role="alert">
        <h1
          ref={heading}
          id="matches-heading"
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

  const shown = page.cards.slice(0, SHOWN);
  const hidden = page.cards[SHOWN];
  const more = Math.max(0, page.total - shown.length);
  const leadQuery = `?${FUNNEL_PATHS.query.lead}=${encodeURIComponent(page.lead.id)}`;
  return (
    <section aria-labelledby="matches-heading">
      <p className="text-xs font-semibold uppercase [letter-spacing:0.2em] text-violet-500">
        {page.total} {page.total === 1 ? "nanny" : "nannies"} matched
      </p>
      <h1
        id="matches-heading"
        className="mt-2 text-3xl font-bold text-slate-900"
      >
        Your top matches
      </h1>
      <p className="mt-2 max-w-xl text-slate-600">
        Matched to your family, your area and your hours. Create your account
        and your matchmaker will call to introduce you to the ones who are
        available and keen.
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {shown.map((card) => (
          <NannyPreviewCard
            key={card.nanny.nannyId}
            nanny={card.nanny}
            ranked={card.ranked}
            profileQuery={`?${FUNNEL_PATHS.query.src}=adv&${FUNNEL_PATHS.query.lead}=${encodeURIComponent(page.lead.id)}`}
          >
            <ConnectButton
              action={connectAction}
              nannyId={card.nanny.nannyId}
              surface="matches"
              leadId={page.lead.id}
            />
          </NannyPreviewCard>
        ))}
        {hidden !== undefined && more > 0 ? (
          <div className="relative">
            <NannyPreviewCard
              nanny={hidden.nanny}
              ranked={hidden.ranked}
              blurred
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/70 p-4 text-center">
              <p className="text-lg font-semibold text-slate-900">
                +{more} more
              </p>
              <p className="text-sm text-slate-600">
                Sign up to see all your matches.
              </p>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Link
          href={`${FUNNEL_PATHS.matchmakingSignup}${leadQuery}`}
          className={primary}
        >
          Connect with best matches
        </Link>
        <Link
          href={`${FUNNEL_PATHS.onboarding}${leadQuery}`}
          className={secondary}
        >
          Change my answers
        </Link>
      </div>
    </section>
  );
}
