// ── REVIEW-2 (typescript-review HIGH) — `app/child-linking`'s fail-closed default, reached for real ────────
//
// **This file never calls `configure*`.** Vitest isolates module state per file, which is the only legal way to
// reach a registry's factory default from outside the module without the deep import the boundary lint forbids
// (the pattern REVIEW-1's H-1 established for the other thirteen modules).
//
// The defect it pins: `child-linking-registry.ts` and `app.stub.ts` both ended their unconfigured object
// `}) as unknown as ChildLinking`. That cast removes the missing-property check, so adding a twelfth method to
// `ChildLinkingLookups` produces **no compile error** and the unconfigured slot answers
// `TypeError: x is not a function` instead of `child-linking-not-configured` — the opposite of what the
// registry's own header says it exists for ("answering 'no children' from nowhere would silently unbound every
// family's grant"). `admin-on-behalf-registry.ts` annotates rather than casts and gets the guarantee for free.
//
// The real fix is the annotation, which is checked by `tsc`. This suite is the run-time half: it walks whatever
// the default actually exposes, so a method that is added to the type and forgotten here fails loudly.
import { describe, expect, it } from "vitest";
import { CHILD_LINKING_REGISTRY } from "../child-linking/lib/child-linking-registry";

type Refusal = {
  readonly ok: boolean;
  readonly error?: { readonly details?: { readonly reason?: string } };
};

describe("app/child-linking — the unconfigured default refuses on every method (REVIEW-2)", () => {
  it("answers child-linking-not-configured, never a success and never a TypeError", async () => {
    const unconfigured = CHILD_LINKING_REGISTRY.get() as unknown as Record<
      string,
      (...args: ReadonlyArray<unknown>) => Promise<Refusal>
    >;
    const methods = Object.keys(unconfigured);
    expect(methods.length).toBeGreaterThan(0);
    for (const name of methods) {
      const answer = await unconfigured[name]?.();
      expect(answer?.ok, `${name} did not refuse`).toBe(false);
      expect(answer?.error?.details?.reason, name).toBe(
        "child-linking-not-configured",
      );
    }
  });
});
