// S-X-22 (`/pricing`) — the services page, plain: the service described, no amount, no second route (04 §6.1;
// P-4, T-1.2). Sydney's families-pay-nothing line and its two-route framing are gone; the call is the next step.
import Link from "next/link";
import { BRAND } from "@/modules/config";
import type { ServiceAreaProps } from "../types";
import { PUBLIC_ROUTES } from "../lib/public-routes";

const homePath =
  PUBLIC_ROUTES.find((route) => route.id === "S-X-01")?.path ?? "/";

const NANNY_QUALITIES = Object.freeze([
  {
    title: "Development in mind",
    body: "Nannies who notice milestones and support age-appropriate development — social, physical and cognitive.",
  },
  {
    title: "Structured play",
    body: "Activities built around language, numbers and creative thinking. Not screen time.",
  },
  {
    title: "Creative exploration",
    body: "Art, music, sensory play, time outdoors — curiosity and self-expression, every day.",
  },
  {
    title: "Checked, every one",
    body: "Identity checked, Enhanced DBS held, right to work in the UK confirmed — before any family meets her.",
  },
]);

const JOURNEY = Object.freeze([
  {
    step: "01",
    title: "Share",
    body: "Your days, your times, your area. What matters most.",
  },
  {
    step: "02",
    title: "Match",
    body: "Matched across location, schedule, experience and approach to the early years.",
  },
  {
    step: "03",
    title: "The call",
    body: "Your matchmaker calls at a time you pick, introduces your top nannies and helps you choose who to meet.",
  },
  {
    step: "04",
    title: "Meet and hire",
    body: "We arrange the meetings and confirm the placement with you both. From there — it's personal.",
  },
]);

export function ServicesContent({ serviceAreaName }: ServiceAreaProps) {
  return (
    <>
      <section
        aria-labelledby="services-heading"
        className="relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-violet-50 via-white to-slate-50" />
        <div className="container relative mx-auto px-4 py-20 md:px-6 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 text-xs font-semibold uppercase [letter-spacing:0.2em] text-violet-500">
              Our service
            </p>
            <h1
              id="services-heading"
              className="text-4xl font-bold leading-[1.1] [letter-spacing:-0.025em] text-slate-900 md:text-5xl lg:text-6xl"
            >
              Nanny matching for London families, done with you.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-500 md:text-xl">
              Your area. Your schedule. What matters most. Nannies matched
              across location, experience and approach to the early years —
              introduced by a matchmaker who calls you, across {serviceAreaName}
              .
            </p>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="nannies-heading"
        className="bg-slate-50 py-16 md:py-24"
      >
        <div className="container mx-auto px-4 md:px-6">
          <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
            <p className="mb-3 text-xs font-semibold uppercase [letter-spacing:0.2em] text-violet-500">
              The nannies
            </p>
            <h2
              id="nannies-heading"
              className="text-3xl font-bold text-slate-900 md:text-4xl"
            >
              Nannies who understand child development
            </h2>
            <p className="mt-4 leading-relaxed text-slate-500">
              Not just available — here because they care about the early years.
              That is the foundation of every match {BRAND.name} makes.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {NANNY_QUALITIES.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-slate-200/80 bg-white p-6 transition-shadow hover:shadow-md"
              >
                <h3 className="font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="journey-heading" className="py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="mb-3 text-xs font-semibold uppercase [letter-spacing:0.2em] text-violet-500">
              How it works
            </p>
            <h2
              id="journey-heading"
              className="text-3xl font-bold text-slate-900 md:text-4xl"
            >
              From your first answers to your first meeting
            </h2>
          </div>
          <ol className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {JOURNEY.map((item) => (
              <li key={item.step}>
                <p className="text-xs font-semibold [letter-spacing:0.2em] text-violet-500">
                  {item.step}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-14 text-center">
            <Link
              href={homePath}
              className="inline-flex h-12 items-center rounded-md bg-violet-500 px-8 text-base font-medium text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            >
              See nannies near you →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
