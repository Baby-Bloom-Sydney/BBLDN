// 01.03 — the public footer. Brand from `config`; legal paths from `URLS.paths.legal` (L4); the rest from the
// route register. The registered company line waits on B-35 (DECISIONS §2) and is not invented here.
import Link from "next/link";
import { BRAND, URLS } from "@/modules/config";
import { PUBLIC_ROUTES } from "../lib/public-routes";

const pathOf = (id: string): string =>
  PUBLIC_ROUTES.find((route) => route.id === id)?.path ?? "/";

const SITE_LINKS = Object.freeze([
  { href: pathOf("S-X-10"), label: "Find a nanny" },
  { href: pathOf("S-X-21"), label: "How it works" },
  { href: pathOf("S-X-22"), label: "Our service" },
  { href: pathOf("S-X-20"), label: "About" },
  { href: pathOf("S-X-23"), label: "Contact us" },
  { href: pathOf("S-X-24"), label: "For nannies" },
]);

const LEGAL_LINKS = Object.freeze([
  { href: URLS.paths.legal.privacy, label: "Privacy" },
  { href: URLS.paths.legal.clientTerms, label: "Client terms" },
  { href: URLS.paths.legal.professionalTerms, label: "Professional terms" },
  { href: URLS.paths.legal.cookies, label: "Cookies" },
  { href: URLS.paths.legal.disclaimer, label: "Legal and contact details" },
]);

export function PublicFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-100 bg-slate-50">
      <div className="container mx-auto grid gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr] md:px-6">
        <div className="max-w-sm">
          <p className="text-lg font-bold [letter-spacing:-0.025em] text-slate-900">
            {BRAND.longName}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Verified, development-focused nannies for London families — matched
            to you, introduced by your matchmaker.
          </p>
        </div>
        <nav aria-label="Site" className="text-sm">
          <p className="font-semibold text-slate-900">Explore</p>
          <ul className="mt-3 space-y-2">
            {SITE_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="text-slate-600 transition-colors hover:text-slate-900"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Legal" className="text-sm">
          <p className="font-semibold text-slate-900">Legal</p>
          <ul className="mt-3 space-y-2">
            {LEGAL_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="text-slate-600 transition-colors hover:text-slate-900"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-slate-200/70">
        <p className="container mx-auto px-4 py-4 text-xs text-slate-400 md:px-6">
          © {year} {BRAND.longName}
        </p>
      </div>
    </footer>
  );
}
