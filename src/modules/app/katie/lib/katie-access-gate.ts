// `07.09` — Katie's subscription access gate (07 §10.1 row `app/katie`: "its tools re-check access per call").
//
// Same three values as the development pages' gate, different consequence, and the middle one is the reason
// this is its own file. Katie answers in sentences, so a blocked tool has to hand the chat route a line rather
// than a status — and the line for "we could not check" must not be the line for "your app is closed". A
// parent asking Katie about her child during an outage, told that her app has lapsed, learns something false
// about her own account from an assistant she trusts.
//
// The copy is ADR-124's: no *free*, no *upgrade*, no "your trial has ended". What is said is what she gets
// back and how, in the guide's voice.
import type { AccessFacts } from "../../child-linking";

export type KatieAccessGate =
  | { readonly kind: "ok" }
  | { readonly kind: "blocked"; readonly line: string }
  | { readonly kind: "unknown"; readonly line: string };

export function katieAccessGate(
  access: AccessFacts | null,
  childFirstName: string,
): KatieAccessGate {
  if (access === null)
    return {
      kind: "unknown",
      line: `I can't reach ${childFirstName}'s records just now — nothing has changed with your app, so give it a moment and ask me again.`,
    };
  if (access.open) return { kind: "ok" };
  if (access.reason === "toggled-off")
    return {
      kind: "blocked",
      line: `${childFirstName}'s app is paused at the moment. Have a word with your matchmaker and they'll switch it straight back on.`,
    };
  return {
    kind: "blocked",
    line: `I'll be able to help with ${childFirstName} again once your app is open. Everything you and your nanny have recorded is still there waiting.`,
  };
}
