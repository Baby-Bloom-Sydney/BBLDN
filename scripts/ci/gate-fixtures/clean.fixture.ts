// The other half of the proof: the same four shapes, written the way the review sweeps' own fixes wrote
// them. `check:gate-fixtures` asserts **zero** reports here.
//
// A gate that fires on the violations file and also fires on this one is not a gate, it is a tax — and a
// tax is how a rule gets turned off six weeks later. Both halves are required: the violations file proves
// the rule has teeth, this one proves the teeth close on the right thing.

import type { Result } from "@/modules/shared-types/result";

type Answers = Readonly<Record<string, string>>;

declare function openDfyAccess(familyId: string): Promise<Result<void>>;
declare function save(answers: Answers, finish: boolean): Promise<void>;
declare function alertOperator(message: string): void;

// 1. The refusal is read. REVIEW-2 C-2's actual fix: the row still lands — a payments failure must not roll
//    back the fact that the nanny started — but the refusal alerts, because a human has to finish what the
//    port could not.
export async function cascadeOnStart(familyId: string): Promise<void> {
  const opened = await openDfyAccess(familyId);
  if (!opened.ok) alertOperator("openDfyAccess refused; the family has no app");
}

// 2. The rejection is handled. REVIEW-2 H-9's actual fix, and note what it is NOT: the dropped `Result` was
//    defensible there (`finish()` re-sends the whole answers object and owns the visible failure), so the
//    fix was to swallow the rejection EXPLICITLY — a different thing from never attaching a handler — and
//    to say why in the code.
export function autosave(next: Answers): void {
  // An autosave refusal costs nothing and must not interrupt a parent mid-question; `finish()` re-sends.
  save(next, false).catch(() => undefined);
}

// 2b. The scheduler is handed something that returns nothing, and the rejection has somewhere to go.
export function pollLater(poll: () => Promise<void>, ms: number): void {
  setTimeout(() => {
    poll().catch(() => alertOperator("poll rejected"));
  }, ms);
}

// 3. The union is exhausted rather than re-narrowed. Adding a fourth `kind` is now a compile error at
//    `_exhaustive` and a lint error at the switch, instead of a blank, unanswerable question at run time.
type Question =
  | { readonly kind: "single"; readonly options: readonly string[] }
  | { readonly kind: "multi"; readonly options: readonly string[] }
  | { readonly kind: "text" };

export function bodyOf(question: Question): readonly string[] {
  switch (question.kind) {
    case "single":
    case "multi":
      return question.options;
    case "text":
      return [];
  }
}

// 4. The argument carries a type the callee accepts. REVIEW-3 H-3's fix is one word on the contract —
//    `mobile` is `E164 | null`, because the column is nullable and an invited nanny genuinely has none.
declare function capture(lead: { readonly mobile: string | null }): void;
declare function widen(value: string): void;

export function applyFromPortal(mobile: string | null): void {
  capture({ mobile });
  widen(String(mobile ?? ""));
}
