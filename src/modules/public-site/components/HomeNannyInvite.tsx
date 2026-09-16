// S-X-01 → S-X-24: the nanny entry line at the foot of the home page (04 §6.1 S-X-24).
import Link from "next/link";
import { PUBLIC_ROUTES } from "../lib/public-routes";

const nanniesPath =
  PUBLIC_ROUTES.find((route) => route.id === "S-X-24")?.path ?? "/";

export function HomeNannyInvite() {
  return (
    <section
      aria-labelledby="nanny-invite-heading"
      className="border-t border-slate-100 bg-slate-50 py-14"
    >
      <div className="container mx-auto flex flex-col items-start justify-between gap-6 px-4 md:flex-row md:items-center md:px-6">
        <div>
          <h2
            id="nanny-invite-heading"
            className="text-2xl font-bold [letter-spacing:-0.025em] text-slate-900"
          >
            Are you a nanny?
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-600">
            Work with London families who value the early years. Set your own
            rates and hours; we introduce you to families matched to you.
          </p>
        </div>
        <Link
          href={nanniesPath}
          className="inline-flex h-11 items-center rounded-md border border-slate-300 bg-white px-5 text-sm font-medium text-slate-900 transition-colors hover:border-violet-400 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        >
          Apply to join →
        </Link>
      </div>
    </section>
  );
}
