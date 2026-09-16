// S-X-20 — About (04 §6.1: Duplicate; metadata London; the two CTAs pass T-6.3). Body carried from the brand
// canon (`01.27`) with one wording change recorded in the L-007 PROGRESS entry.
import Link from "next/link";
import { PUBLIC_ROUTES } from "../lib/public-routes";

const pathOf = (id: string): string =>
  PUBLIC_ROUTES.find((route) => route.id === id)?.path ?? "/";

export function AboutContent() {
  return (
    <>
      <section
        aria-labelledby="about-heading"
        className="relative overflow-hidden pb-24 pt-20 md:pb-36 md:pt-32 lg:pb-44 lg:pt-40"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_20%_40%,rgba(139,92,246,0.04),transparent)]" />
        <div className="container relative mx-auto px-4 md:px-6">
          <h1
            id="about-heading"
            className="max-w-4xl text-[2.5rem] font-bold leading-[1.08] [letter-spacing:-0.025em] text-slate-900 md:text-[3.5rem] lg:text-[4.25rem]"
          >
            The early years shape{" "}
            <span className="text-violet-500">everything</span> that follows.
          </h1>
        </div>
      </section>

      <section className="pb-20 md:pb-32">
        <div className="container mx-auto grid items-start gap-12 px-4 md:px-6 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
          <div>
            <div className="mb-8 h-1 w-10 rounded-full bg-violet-500" />
            <h2 className="text-2xl font-bold leading-snug text-slate-900 md:text-3xl">
              A child who explores with confidence at two asks better questions
              at five.
            </h2>
          </div>
          <div className="space-y-5 text-[15px] leading-relaxed text-slate-600 md:text-base lg:pt-2">
            <p>
              How a child plays. How they are spoken to. How their curiosity is
              received. It all compounds — quietly, relentlessly — into the
              person they become.
            </p>
            <p>
              The first five years are not preparation for life. They are the
              most formative stretch of it. The patterns laid down here shape
              how a child learns, how they relate to others, how they see
              themselves.
            </p>
            <p className="font-medium text-slate-900">
              The people who care for a child during this time are among the
              most important people in that child&apos;s life.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-20 md:py-32">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mx-auto max-w-2xl space-y-6 text-[15px] leading-relaxed text-slate-600 md:text-base">
            <p>
              Structured play that builds towards something. Milestones noticed,
              not just waited for. A carer who sees your child — not as a
              routine, but as a person becoming.
            </p>
            <p>
              This is what it looks like when the care is right. The child is
              calmer. More curious. More willing to try. Not because anyone is
              pushing — because the environment makes growth feel natural.
            </p>
            <p className="font-medium text-slate-900">
              Everything starts here.
            </p>
          </div>
        </div>
      </section>

      <section className="py-24 md:py-36">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl">
            <div className="mb-8 h-1 w-10 rounded-full bg-violet-500" />
            <p className="text-2xl font-bold leading-snug [letter-spacing:-0.025em] text-slate-900 md:text-3xl lg:text-[2.125rem]">
              The right care changes everything.
            </p>
            <p className="mt-3 text-lg leading-relaxed text-slate-400 md:text-xl">
              For good.
            </p>
            <div className="mt-10">
              <Link
                href={pathOf("S-X-01")}
                className="inline-flex h-12 items-center rounded-md bg-violet-500 px-8 text-base font-medium text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                Get started →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 py-8">
        <div className="container mx-auto flex flex-col items-center justify-center gap-2 px-4 text-center sm:flex-row sm:gap-4 md:px-6">
          <p className="text-sm text-slate-500">Childcare professional?</p>
          <Link
            href={pathOf("S-X-24")}
            className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 transition-colors hover:text-violet-700"
          >
            Apply here →
          </Link>
        </div>
      </section>
    </>
  );
}
