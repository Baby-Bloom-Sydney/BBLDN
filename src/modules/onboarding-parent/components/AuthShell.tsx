// The `(auth)` group chrome (01 §4d; 04 §6.1 S-X-05 … S-X-09): the brand from config (L4), one card, the two legal
// links every signed-out screen shows. No marketing, no "Sydney" (T-6.1). Rendered by the group layout only.
import type { AuthShellProps } from "../types";

export function AuthShell(props: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_70%_60%_at_15%_20%,rgba(139,92,246,0.08),transparent)] px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-8 text-center">
          <a
            href={props.homeHref}
            className="text-3xl font-bold [letter-spacing:-0.025em] text-slate-900"
          >
            {props.brandName}
          </a>
        </p>
        <main className="rounded-2xl border border-violet-100 bg-white p-8 shadow-xl shadow-violet-100/50">
          {props.children}
        </main>
        <nav
          aria-label="Legal"
          className="mt-8 flex justify-center gap-4 text-xs text-slate-500"
        >
          <a href={props.clientTermsHref} className="hover:underline">
            Client terms
          </a>
          <a href={props.privacyHref} className="hover:underline">
            Privacy policy
          </a>
        </nav>
      </div>
    </div>
  );
}
