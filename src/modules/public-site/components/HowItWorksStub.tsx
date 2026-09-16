// S-X-21 — heading-only stub, route kept (BAI 2026-09-08; 04 §6.1). If it is ever built out, its steps must
// name the call; the one line here already does.
import Link from "next/link";
import { PUBLIC_ROUTES } from "../lib/public-routes";

const homePath =
  PUBLIC_ROUTES.find((route) => route.id === "S-X-01")?.path ?? "/";

export function HowItWorksStub() {
  return (
    <section
      aria-labelledby="how-heading"
      className="container mx-auto px-4 py-16 md:px-6 md:py-24"
    >
      <h1
        id="how-heading"
        className="text-3xl font-bold [letter-spacing:-0.025em] text-slate-900 md:text-4xl"
      >
        How it works
      </h1>
      <p className="mt-4 max-w-xl text-slate-600">
        Tell us what you need, we match you with verified nannies near you, and
        your matchmaker calls to introduce you to your top nannies.
      </p>
      <Link
        href={homePath}
        className="mt-8 inline-flex text-sm font-medium text-violet-600 hover:text-violet-700"
      >
        See nannies near you →
      </Link>
    </section>
  );
}
