// The one place the wizard's field classes live, so the steps read the same and a restyle is one edit. The
// violet / slate palette is the design system's (memory: modular reuse of the existing design). The same shape
// as `onboarding-nanny`'s — 01 §2.3 gives this module no arrow to it (the M-10 shape, recorded in the README).
export const FIELD_STYLES = Object.freeze({
  input:
    "mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 aria-[invalid=true]:border-red-500",
  file: "mt-2 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-violet-700 hover:file:bg-violet-100",
  label: "text-sm font-medium text-slate-900",
  hint: "mt-1 text-xs text-slate-500",
  choice:
    "flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 has-[:checked]:border-violet-500 has-[:checked]:bg-violet-50",
  primary:
    "inline-flex w-full items-center justify-center rounded-md bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40 disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500/30",
  link: "text-sm font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900",
  note: "rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700",
});
