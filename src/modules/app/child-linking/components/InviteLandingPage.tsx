// **S-X-13** `/invite/[token]` — the child-invite public preview (04 §6.1), both directions. A server
// component over one pure view, so every word a visitor reads is `inviteLandingView`'s and the copy suite can
// read the words rather than the file they live in.
//
// The page is `noindex` and `no-referrer` (set on the route's `metadata`): a token in a `Referer` header is a
// token in somebody else's server log, and 07 §8 row 7's whole defence is that tokens do not travel.
import Link from "next/link";
import { BRAND } from "@/modules/config";
import type { InviteLandingView } from "../lib/invite-landing-view";
import { ClaimInviteForm } from "./ClaimInviteForm";
import { startInviteSignupAction } from "../actions/start-invite-signup-action";

export type InviteLandingPageProps = {
  readonly view: InviteLandingView;
  readonly token: string | null;
};

export function InviteLandingPage({ view, token }: InviteLandingPageProps) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-12">
      <p className="text-xs font-semibold uppercase [letter-spacing:0.14em] text-violet-700">
        {BRAND.name}
      </p>
      <h1 className="mt-2 text-2xl font-semibold [letter-spacing:-0.01em] text-slate-900">
        {view.heading}
      </h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-slate-600">
        {view.body}
      </p>

      {view.kind === "open" ? (
        <div className="mt-8 space-y-3">
          {view.action.kind === "claim" && token !== null ? (
            <ClaimInviteForm token={token} label={view.action.label} />
          ) : null}
          {view.action.kind === "signup" && token !== null ? (
            // ADR-150: a form, not a link — the token travels in the `HttpOnly` cookie the action mints, and
            // neither `/signup` nor `/login` ever sees it in a URL.
            <form action={startInviteSignupAction}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="role" value={view.action.role} />
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
              >
                {view.action.label}
              </button>
            </form>
          ) : null}
          {view.action.kind === "none" ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {view.action.label}
            </p>
          ) : null}
          {view.secondary === undefined ? null : (
            <Link
              href={view.secondary.href}
              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              {view.secondary.label}
            </Link>
          )}
        </div>
      ) : (
        <Link
          href={view.action.href}
          className="mt-8 inline-flex w-fit items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
        >
          {view.action.label}
        </Link>
      )}
    </main>
  );
}
