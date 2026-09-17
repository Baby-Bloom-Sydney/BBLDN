// **S-P-13** — the app, seen through the gate (04 §6.2; `07.09` the subscription access gate; `07.59` the
// development pages). Pure, and the three-way answer is the whole point of the file.
//
// ★ `accessGate.hasAccess` **fails closed by carrying `payments`' error** rather than defaulting to
// `{ open: false }` (`1h`). That distinction has to survive all the way to the screen, because the two closed
// states are nothing alike:
//
//   closed  — we know the app is shut for this family. Show the paywall, in guide voice.
//   unknown — we could not tell. Show "we couldn't check just now", and **never the paywall**: a paying family
//             told to pay again during a database blip is the worst thing this surface can do, and it is
//             exactly what a defaulted `open: false` would produce.
//
// The gate's decision arrives **structurally**, not as an import: 01 §2.3 gives `app` no arrow to `access-gate`
// (nothing at all may import it but itself), so the page reads the gate and hands the two fields down. The
// shape is three fields wide, which is all any of this needs.
//
// Copy (ADR-124; 00-glossary §6, P-4). The banned words bite hard here — this is the one parent surface whose
// job is to say "not right now". So: never *free*, never *upgrade*, never *price* or *fee*, never *offer*, and
// never a "your free trial has ended" framing. The paywall says **what the family gets**, not what they lack,
// and the way back is the next step rather than a punishment. There is **no countdown anywhere** — the T-5
// email is the only reminder (04 §3 ruling carried; memory: no ambient trial banners).
import type { ChildRecord } from "../types";

/** The gate's answer, structurally — `AccessDecision` from `access-gate`, minus what this view never reads. */
export type AccessFacts = {
  readonly open: boolean;
  readonly reason: string;
};

export type AppAccessView =
  | {
      readonly kind: "open";
      readonly children: ReadonlyArray<ChildRecord>;
    }
  | {
      readonly kind: "unknown";
      readonly heading: string;
      readonly body: string;
    }
  | {
      readonly kind: "closed";
      readonly heading: string;
      readonly body: string;
      readonly action: { readonly label: string; readonly href: string };
    };

/**
 * The reasons that are an **admin's** doing rather than a standing the family can act on (ADR-093). 04 §8's
 * row for the off-toggle is explicit: the family is told to ask their matchmaker, and is shown **no paywall** —
 * offering to take money from someone the operator has just switched off would be a lie about who is in
 * control.
 */
const TOGGLED_OFF = "toggled-off";

const SELF_SERVE_HREF = "/parent/subscribe";

export function appAccessView(input: {
  readonly access: AccessFacts | null;
  readonly children: ReadonlyArray<ChildRecord>;
}): AppAccessView {
  if (input.access === null)
    return {
      kind: "unknown",
      heading: "We couldn't check your app just now",
      body: "Nothing has changed with your account — we just couldn't reach our records. Try again in a moment, and tell us if it keeps happening.",
    };

  if (input.access.open) return { kind: "open", children: input.children };

  if (input.access.reason === TOGGLED_OFF)
    return {
      kind: "closed",
      heading: "Your app is paused",
      body: "Your matchmaker paused it. Have a word with them and they'll switch it straight back on.",
      action: { label: "Contact us", href: "/contact" },
    };

  return {
    kind: "closed",
    heading: "Open your app again",
    body: "Your app holds everything your nanny and your family record about your child — their days, what they're learning, and what comes next. It stays open until your youngest turns 3, and it covers every child you have after that.",
    action: { label: "See how to open it", href: SELF_SERVE_HREF },
  };
}
