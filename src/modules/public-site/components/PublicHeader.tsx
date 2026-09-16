"use client";
// 01.02 — the public header (S-X-01 … S-X-25). Renders from the pathname only, never from a client auth
// state resolving in time (01 §4d "defence in depth"): the right-hand side is always Sign in + Get started.
// Brand from `config` (L4); paths from the route register.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/modules/config";
import { PUBLIC_ROUTES } from "../lib/public-routes";

const NAV: ReadonlyArray<{ readonly id: string; readonly label: string }> =
  Object.freeze([
    { id: "S-X-10", label: "Find a nanny" },
    { id: "S-X-21", label: "How it works" },
    { id: "S-X-22", label: "Our service" },
    { id: "S-X-20", label: "About" },
    { id: "S-X-24", label: "For nannies" },
  ]);

const pathOf = (id: string): string =>
  PUBLIC_ROUTES.find((route) => route.id === id)?.path ?? "/";

export function PublicHeader() {
  const pathname = usePathname();
  const [brandFirst, brandRest] = [BRAND.name.slice(0, 4), BRAND.name.slice(4)];
  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/85 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between gap-6 px-4 md:px-6">
        <Link
          href={pathOf("S-X-01")}
          aria-label={`${BRAND.longName} — home`}
          className="flex items-baseline text-xl font-bold [letter-spacing:-0.025em]"
        >
          <span className="text-slate-900">{brandFirst}</span>
          <span className="text-violet-500">{brandRest}</span>
        </Link>

        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-6 text-sm text-slate-600 md:flex"
        >
          {NAV.map(({ id, label }) => {
            const href = pathOf(id);
            const current = pathname === href;
            return (
              <Link
                key={id}
                href={href}
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "font-medium text-slate-900"
                    : "transition-colors hover:text-slate-900"
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href={pathOf("S-X-08")}
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            Sign in
          </Link>
          <Link
            href={pathOf("S-X-06")}
            className="rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
