// Rows 7 and 8 of the parent rail, gathered where both halves are legal to read (04 §7.1).
//
// It is a **route-level** read and it lives in the route tree because nowhere else can hold it: `positions`
// composes the rail and may import neither `payments` nor `app`; `app` may import neither `payments` nor
// `access-gate`; and `access-gate` may be imported by nothing at all (01 §2.3, enforced by `lint:boundaries` —
// the first draft of this file sat in `app/child-linking/lib` and the lint refused it, correctly). The one
// place all three are reachable is a route file, so the page reads and the rail is handed facts.
//
// Every read is best-effort. A rail that vanished because the money read was slow would be a worse answer than
// a rail whose last two rows read `pending` (04 §7.1 "never hidden, never empty").
import type { AppRailFacts } from "@/modules/positions";
import type { FamilyId } from "@/modules/shared-types";
import { childLinking } from "@/modules/app";
import type { AccessFacts } from "@/modules/app";

/** What the page has already read from the gate and the money standing, so neither is asked for twice. */
export type AppRailInput = {
  readonly familyId: FamilyId;
  readonly access: AccessFacts | null;
  readonly standing: AppRailFacts["standing"] | null;
  readonly appOnFrom?: string;
  readonly paymentDueAt?: string;
};

export async function appRailFacts(
  input: AppRailInput,
): Promise<AppRailFacts | undefined> {
  if (input.access === null || input.standing === null) return undefined;
  const link = await childLinking.appLinkFacts(input.familyId);
  return {
    standing: input.standing,
    open: input.access.open,
    ...(input.appOnFrom === undefined ? {} : { appOnFrom: input.appOnFrom }),
    ...(input.paymentDueAt === undefined
      ? {}
      : { paymentDueAt: input.paymentDueAt }),
    ...(link.ok ? { link: link.value } : {}),
  };
}
