// `handleWebhook` — the single completion spine (03 §5.4.3), in the order the contract states and nothing else:
//   1. `provider.parseEvent` verifies the signature **before** anything is parsed or dispatched (07 §10.1);
//      unverified → `E_EVENT_UNVERIFIED` (400, the provider never retries).
//   2. `payment_events(provider, event_id)` is inserted **before** dispatch; a duplicate → `skipped-duplicate`, 200.
//   3. The family is resolved by the `LinkRef` we minted; unknown → `E_EVENT_UNRESOLVED`, answered as 200 `ignored`.
//   4. The pure table (`dispatch-purchase-event.ts`) decides the transition; the row is written; the window
//      recomputed on a paid transition (ADR-083 / 084); events emitted post-write; `app-ready` sent once.
//   5. The ledger row is stamped `processed_at` — or `processing_error` and the call fails, so the provider retries.
//
// There is no unit of work here, and that is stated rather than hidden: ADR-127 makes one RPC one transaction,
// and this spine is a table insert + a table update. The ledger's `processed_at IS NULL` index (0010 §2) is what
// the runbook reconciles from when a write lands between the two.
import { PRICES } from "@/modules/config";
import { log, ok } from "@/modules/platform";
import type { PurchaseEvent } from "@/modules/purchase-paths";
import type {
  EventName,
  FamilyId,
  Instant,
  Result,
  Uuid,
} from "@/modules/shared-types";
import type { AccessChange, AccessState, PurchasePath } from "../types";
import { accessStateFromRow } from "./access-state-from-row";
import type { PaymentsDeps } from "./deps";
import { dispatchPurchaseEvent } from "./dispatch-purchase-event";
import { emitMoneyEvents } from "./emit-money-events";
import { fail } from "./fail";
import { parseLinkRef } from "./parse-link-ref";
import { sendAppReady } from "./send-app-ready";
import type { SpineRow } from "./spine-store";

const NONE: AccessState = Object.freeze({ state: "none" });
const UNRESOLVED_FAMILY = "" as FamilyId;
const WEBHOOK_ACTOR = { kind: "system", id: "payments-webhook" } as const;

const ignored = (familyId: FamilyId, before: AccessState): AccessChange =>
  Object.freeze({
    familyId,
    before,
    after: before,
    events: Object.freeze([]),
    handled: "ignored" as const,
  });

type MoneyEvent = Exclude<PurchaseEvent, { kind: "ignored" }>;

/** The family a verified event belongs to: by the ref's shape, then by the row, then by the ref on the row. */
async function resolveFamily(
  deps: PaymentsDeps,
  event: MoneyEvent,
): Promise<Result<SpineRow | null>> {
  const parsed = parseLinkRef(event.ref);
  if (parsed === null) return ok(null);
  const row = await deps.store.readByFamily(parsed.familyId, "service");
  if (!row.ok || row.value === null) return row;
  const onRow =
    parsed.purpose === "checkout" ||
    row.value.deposit_link_ref === event.ref ||
    row.value.balance_link_ref === event.ref ||
    parsed.purpose === "custom";
  return ok(onRow ? row.value : null);
}

async function applyTransition(
  deps: PaymentsDeps,
  row: SpineRow,
  event: MoneyEvent,
  now: Instant,
): Promise<Result<AccessChange>> {
  const familyId = row.parent_user_id as FamilyId;
  const before = accessStateFromRow(row, now);
  const transition = dispatchPurchaseEvent(row, event, now);
  if (transition.handled === "ignored") return ok(ignored(familyId, before));
  const written = await deps.store.updateSpine(row.id, transition.patch);
  if (!written.ok) return written;
  if (transition.patch.status !== undefined)
    await deps.store.setAccessWindow(familyId, PRICES.accessAgeYears);
  const events = await emitMoneyEvents(deps.events, {
    names: transition.events,
    familyId,
    actor: WEBHOOK_ACTOR,
    ref: event.ref,
    props: {
      path: purchasePath(event),
      providerEventId: event.eventId,
      ...(event.kind === "purchase.completed"
        ? { preset: event.preset, amountMinor: event.paid.pence, shape: event.shape.kind }
        : {}),
    },
  });
  if (transition.appReady) {
    const contact = await deps.store.familyContact(familyId);
    await sendAppReady(deps.comms, familyId, contact.ok ? contact.value : null);
  }
  return ok(
    Object.freeze({
      familyId,
      before,
      after: accessStateFromRow(written.value, now),
      events: events as ReadonlyArray<EventName>,
      handled: "handled" as const,
    }),
  );
}

const purchasePath = (event: MoneyEvent): "payment-link" | "self-serve" =>
  event.kind === "purchase.completed" && event.linkKind === "checkout"
    ? "self-serve"
    : "payment-link";

async function stamp(
  deps: PaymentsDeps,
  ledgerId: Uuid,
  familyId: FamilyId | null,
  outcome: Result<AccessChange>,
  now: Instant,
): Promise<void> {
  const patch = outcome.ok
    ? { processed_at: now, parent_user_id: familyId }
    : { processing_error: outcome.error.code, parent_user_id: familyId };
  const stamped = await deps.store.stampEvent(ledgerId, patch);
  if (!stamped.ok)
    log.error("payment event ledger not stamped", {
      module: "payments",
      action: "webhook",
      alert: "ALERT_PROVIDER_DOWN",
      errorCode: stamped.error.code,
    });
}

export function webhookMethod(
  deps: PaymentsDeps,
): Pick<PurchasePath, "handleWebhook"> {
  return {
    handleWebhook: async (raw) => {
      const parsed = deps.provider.parseEvent(raw);
      if (!parsed.ok)
        return fail("E_EVENT_UNVERIFIED", "The event is not verified", deps.provider.name);
      const event = parsed.value;
      const now = deps.now();
      const ledger = await deps.store.insertEvent({
        provider: deps.provider.name,
        provider_event_id: event.eventId,
        event_type: event.kind,
        payload: JSON.parse(raw.rawBody) as Record<string, unknown>,
        received_at: raw.receivedAt,
      });
      if (!ledger.ok) return ledger;
      if (ledger.value.kind === "duplicate")
        return ok({ ...ignored(UNRESOLVED_FAMILY, NONE), handled: "skipped-duplicate" as const });
      if (event.kind === "ignored") {
        await stamp(deps, ledger.value.id, null, ok(ignored(UNRESOLVED_FAMILY, NONE)), now);
        return ok(ignored(UNRESOLVED_FAMILY, NONE));
      }
      const row = await resolveFamily(deps, event);
      if (row.ok && row.value === null) {
        log.warn("payment event unresolved: no link we minted", {
          module: "payments",
          action: "webhook",
          provider: deps.provider.name,
        });
        await stamp(deps, ledger.value.id, null, ok(ignored(UNRESOLVED_FAMILY, NONE)), now);
        return ok(ignored(UNRESOLVED_FAMILY, NONE));
      }
      const outcome = row.ok ? await applyTransition(deps, row.value as SpineRow, event, now) : row;
      await stamp(deps, ledger.value.id, row.ok ? ((row.value as SpineRow).parent_user_id as FamilyId) : null, outcome, now);
      return outcome;
    },
  };
}
