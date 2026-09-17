"use client";
// N2 (04 §4.1 row 6; S-X-16): "Application received" — a breath between the application and the portfolio.
export function InterstitialStep({ firstName }: { readonly firstName?: string }) {
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <p>{firstName ? `Thanks, ${firstName}.` : "Thanks."} Your application is in.</p>
      <p>
        Next, a few things about the work you&rsquo;re looking for, then your profile — the part a family reads
        when we introduce you.
      </p>
    </div>
  );
}
