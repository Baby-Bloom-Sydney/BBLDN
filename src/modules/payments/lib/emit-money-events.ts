// The money events of 03 §5.5, emitted post-commit (P1-WIRE: `Events.emit` runs outside any unit of work) with
// ids only — never a name, an email or an amount that is not integer pence. A failed emit is logged and does not
// fail the money transition that already happened: the row is the truth, the event log is the trail.
import { log } from "@/modules/platform";
import type {
  EmitInput,
  EventActor,
  EventsConnector,
} from "@/modules/platform";
import type { EventName, FamilyId, LinkRef } from "@/modules/shared-types";
import type { MoneyEventName } from "./dispatch-purchase-event";

export type MoneyEventProps = {
  readonly path: "payment-link" | "self-serve";
  readonly linkKind?: "deposit" | "balance-after-week-1" | "custom";
  readonly preset?: string;
  readonly amountMinor?: number;
  readonly depositMinor?: number;
  readonly firstWeekWagesMinor?: number;
  readonly shape?: "upfront" | "instalments";
  readonly reason?: string;
  readonly on?: boolean;
  readonly until?: string;
  readonly trialEndsAt?: string;
  readonly paymentDueAt?: string;
  readonly satisfactionWindowEndsAt?: string;
  readonly placementId?: string;
  readonly providerEventId?: string;
};

export type EmitMoneyEventsInput = {
  readonly names: ReadonlyArray<MoneyEventName>;
  readonly familyId: FamilyId;
  readonly actor: EventActor;
  readonly props: MoneyEventProps;
  readonly ref?: LinkRef;
};

/**
 * One envelope, name-narrowed. `EmitInput` is distributive over the name, and three of the ten money schemas
 * carry a **required** prop the others leave optional — `access.opened` / `access.lapsed` need `reason`,
 * `access.toggled` needs `reason` and `on`. Supplying them unconditionally would emit `on: false` on a
 * `bundle.paid`, which is a lie in the event log; so the narrowing is done here, once, and a caller that forgets
 * `reason` on an `access.*` event fails the compile rather than the emit.
 */
function envelopeFor(
  name: MoneyEventName,
  base: EmitMoneyEventsInput,
): EmitInput<MoneyEventName> {
  const subject = { kind: "purchase", id: base.familyId } as const;
  const props = { ...base.props, familyId: base.familyId };
  const { actor } = base;
  if (name === "access.toggled")
    return {
      name,
      actor,
      subject,
      props: { ...props, reason: props.reason ?? "", on: props.on ?? false },
    };
  if (name === "access.opened" || name === "access.lapsed")
    return {
      name,
      actor,
      subject,
      props: { ...props, reason: props.reason ?? "" },
    };
  return { name, actor, subject, props };
}

export async function emitMoneyEvents(
  events: Pick<EventsConnector, "emit">,
  input: EmitMoneyEventsInput,
): Promise<ReadonlyArray<EventName>> {
  const emitted: EventName[] = [];
  for (const name of input.names) {
    const result = await events.emit(envelopeFor(name, input));
    if (result.ok) emitted.push(name);
    else
      log.warn("money event not written", {
        module: "payments",
        action: "emit",
        event: name,
        errorCode: result.error.code,
      });
  }
  return Object.freeze(emitted);
}
