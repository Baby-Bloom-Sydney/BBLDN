// The `(funnel)` group's chrome for S-X-02 · S-X-03 · S-X-04 (01 §4d): the brand mark home, one line of context,
// no navigation — a funnel screen has one way forward. Brand from `config` (L4).
import Link from "next/link";
import { BRAND } from "@/modules/config";

export type FunnelShellProps = {
  readonly children: React.ReactNode;
  readonly aside?: React.ReactNode;
};

export function FunnelShell({ children, aside }: FunnelShellProps) {
  const [brandFirst, brandRest] = [BRAND.name.slice(0, 4), BRAND.name.slice(4)];
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-slate-100">
        <div className="container mx-auto flex h-14 items-center justify-between px-4 md:px-6">
          <Link
            href="/"
            aria-label={`${BRAND.longName} — home`}
            className="flex items-baseline text-lg font-bold [letter-spacing:-0.025em]"
          >
            <span className="text-slate-900">{brandFirst}</span>
            <span className="text-violet-500">{brandRest}</span>
          </Link>
          {aside}
        </div>
      </header>
      <main className="container mx-auto flex-1 px-4 py-8 md:px-6 md:py-12">
        {children}
      </main>
    </div>
  );
}
