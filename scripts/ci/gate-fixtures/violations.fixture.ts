// A file of deliberate violations — one per class `eslint.typed.js` gates, each a reconstruction of the
// review finding that class comes from. `npm run check:gate-fixtures` lints this file with the gate's own
// rule set and asserts that every rule fires the expected number of times.
//
// **Why this file exists.** `3i` and `3j` both shipped gates that passed vacuously until somebody drove
// them against a real violation. A green gate proves nothing on its own: it is equally consistent with "the
// tree is clean" and with "the rule never ran". This is the other direction, made permanent rather than
// done once at the landing — so the day someone loosens an option, renames a rule, or breaks the plugin
// wiring, a check goes red instead of the tree going quietly unguarded.
//
// It is NOT compiled into the app and nothing imports it. It must, however, type-check: every violation
// below is a LINT defect, not a type error, which is precisely why the compiler did not catch any of them
// when they shipped.
//
// Keep the counts in `check-gate-fixtures.mjs` in step with this file. If you add a case, add its count.

import type { Result } from "@/modules/shared-types/result";

type Answers = Readonly<Record<string, string>>;

declare function openDfyAccess(familyId: string): Promise<Result<void>>;
declare function save(answers: Answers, finish: boolean): Promise<void>;

// ── 1. A discarded `Result` — REVIEW-2 C-2 ─────────────────────────────────────────────────────────────────
// `await deps.openDfyAccess({ … })` with no `.ok` check, no log and no alert. By ADR-097 the deposit is
// already taken at this point, so the money is in, the product is off, and nothing in any log correlates to
// it. Rated CRITICAL: a paid done-for-you family's app could silently never open.
export async function cascadeOnStart(familyId: string): Promise<void> {
  await openDfyAccess(familyId);
}

// ── 2. A floating promise — REVIEW-2 H-9 ───────────────────────────────────────────────────────────────────
// `void save(next, false)`. `void` suppresses the lint signal WITHOUT attaching a handler, so a rejected
// server-action transport becomes an unhandled promise rejection. This is the case that makes
// `ignoreVoid: false` load-bearing: the default option would pass this exact line.
export function autosave(next: Answers): void {
  void save(next, false);
}

// ── 2b. A promise handed where a void return is expected — REVIEW-3 L-5 ───────────────────────────────────
// `setTimeout(poll, options.pollMs)` in `ProcessingStep.tsx`, where `poll` is `async`. The scheduler
// discards the promise it is handed, so a transport rejection inside the next tick is an unhandled
// rejection with nothing to attach a handler to. The same class as H-9 reached from the other side, and the
// reason `no-misused-promises` sits beside `no-floating-promises` rather than instead of it.
export function pollLater(poll: () => Promise<void>, ms: number): void {
  setTimeout(poll, ms);
}

// ── 3. A `default:` that re-narrows a union instead of exhausting it — REVIEW-2 M-16 ───────────────────────
// Adding a sixth `kind` compiles silently and renders a blank, unanswerable question. A
// `const _exhaustive: never = question` would have made the addition a compile error; nothing did.
type Question =
  | { readonly kind: "single"; readonly options: readonly string[] }
  | { readonly kind: "multi"; readonly options: readonly string[] }
  | { readonly kind: "text" };

export function bodyOf(question: Question): readonly string[] {
  switch (question.kind) {
    case "multi":
      return question.options;
    default:
      return (
        (question as { readonly options?: readonly string[] }).options ?? []
      );
  }
}

// ── 4. `as never` / `as any` — REVIEW-3 H-3 / REVIEW-2 M-12 ───────────────────────────────────────────────
// `NannyApplicationInput.mobile` is `E164` — not optional, not nullable — so the module had no legal value
// to pass and `"" as never` is the cast that hid that from the compiler. The column refused the empty
// string, `apply()` returned `lead-not-captured`, and an invited nanny with no mobile could never leave
// isolation. No `any` and no ordinary cast was involved, so nothing caught it.
//
// **Written at its real nesting on purpose.** The shipped line is
// `capture({ …, mobile: me.mobile ?? ("" as never), … })` — the cast is inside an object property inside a
// `??`, not a direct argument. A `CallExpression > TSAsExpression` selector reports nothing here, which is
// how this fixture corrected the rule rather than merely confirming it. Do not "simplify" this case.
declare function capture(lead: { readonly mobile: string }): void;
declare function widen(value: string): void;

export function applyFromPortal(mobile: string | undefined): void {
  capture({ mobile: mobile ?? ("" as never) });
  widen("x" as any);
}
