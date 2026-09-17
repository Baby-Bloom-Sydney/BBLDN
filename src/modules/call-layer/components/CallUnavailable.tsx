// S-P-01 when the call itself cannot be read (04 §6.2 S-P-01 L·E·E: "the page still says we will call"). The
// promise holds whatever the calendar does — a parent who leaves without picking is still called (ADR-073).
export function CallUnavailable({
  dashboardHref,
}: {
  readonly dashboardHref: string;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 md:py-14">
      <section aria-labelledby="call-heading">
        <h1
          id="call-heading"
          className="text-3xl font-bold leading-tight [letter-spacing:-0.02em] text-slate-900 md:text-4xl"
        >
          Your matchmaker will call you.
        </h1>
        <p
          role="status"
          className="mt-4 text-base leading-relaxed text-slate-600"
        >
          We couldn&apos;t load your times just now. Your matchmaker will still
          call you — try again in a moment, or head back to your steps.
        </p>
        <div className="mt-6 flex flex-wrap gap-4">
          <a
            href="/parent/call"
            className="text-sm font-medium text-violet-700 underline-offset-4 hover:underline"
          >
            Try again
          </a>
          <a
            href={dashboardHref}
            className="text-sm font-medium text-violet-700 underline-offset-4 hover:underline"
          >
            Back to your steps
          </a>
        </div>
      </section>
    </main>
  );
}
