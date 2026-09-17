// `handleWebhook` — the single completion spine (03 §5.4.3), in the order the contract states and nothing else:
//   1. `provider.parseEvent` verifies the signature **before** anything is parsed or dispatched (07 §10.1);
//      unverified → `E_EVENT_UNVERIFIED` (400, the provider never retries).
//   2. `payment_events(provider, event_id)` is inserted **before** dispatch; a duplicate → `skipped-duplicate`, 200.
//   3. The family is resolved by the `LinkRef` we minted; unknown → recorded and answered as 200 `ignored`.
//   4. The pure table (`dispatch-purchase-event.ts`) decides the transition; the row is written; the window
//      recomputed on a paid transition (ADR-083 / 084); events emitted post-write; `app-ready` sent once.
//   5. The ledger row is stamped `processed_at` — or `processing_error` and the call fails, so the provider retries.
//
// **Steps 2, 4 and 5 are ONE statement: `apply_payment_event` (`0019`; ADR-127).** `1h` wrote this spine as a
// ledger insert, a spine update and a stamp — three implicit PostgREST transactions — and recorded the gap:
// "making it atomic means a new SECURITY DEFINER function and therefore a migration, which this unit may not
// write." `0019` is that function, and this file now calls it. The consequence is a reordering: the family is
// resolved **before** the ledger row exists, because the function is handed a decided patch. 03 §5.4.3's
// "insert before dispatch" survives it intact — the insert is the first statement inside the transaction that
// dispatches — and "transition atomically" is true for the first time. The ledger's `processed_at IS NULL`
// index (0010 §2) still earns its place: the `unresolved` outcome commits the row with its `processing_error`
// and no spine write, which is exactly what the runbook reconciles from.
//
// **`0020` (ADR-146) closed the last path here that was not one transaction.** S5d recorded it in this file
// rather than hiding it: a delivery with nothing to do — an event type we do not handle, or a `LinkRef` we
// never minted — had to be `applyEvent` **then** `stampEvent`, because the function's only answer for a null
// family was `unresolved`, which stamps `processing_error` and leaves the row on the unprocessed index for
// ever. The function now answers `ignored` when no patch crosses the seam: recorded, stamped, no money, one
// statement. Every road out of `handleWebhook` is a single RPC.
import { PRICES } from "@/modules/config";
import { log, ok } from "@/modules/platform";
import type { PurchaseEvent } from "@/modules/purchase-paths";
import type {
  EventName,
  FamilyId,
  Instant,
  Json,
  Result,
} from "@/modules/shared-types";
import type { AccessChange, AccessState, PurchasePath } from "../types";
import { accessStateFromRow } from "./access-state-from-row";
import { carryStoreError } from "./carry-store-error";
import type { PaymentsDeps } from "./deps";
import { dispatchPurchaseEvent } from "./dispatch-purchase-event";
import { emitMoneyEvents } from "./emit-money-events";
import { fail } from "./fail";
import { parseLinkRef } from "./parse-link-ref";
import { sendAppReady } from "./send-app-ready";
import type { PaymentDelivery, SpineRow } from "./spine-store";

/** The delivery as it arrived: everything `apply_payment_event` needs before a family is known. */
type RawDelivery = Required<
  Pick<
    PaymentDelivery,
    "provider" | "providerEventId" | "eventType" | "payload" | "receivedAt"
  >
>;

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
  raw: RawDelivery,
  now: Instant,
): Promise<Result<AccessChange>> {
  const familyId = row.parent_user_id as FamilyId;
  const before = accessStateFromRow(row, now);
  const transition = dispatchPurchaseEvent(row, event, now);
  // **One RPC, one transaction (ADR-127).** The ledger insert, the spine update, the access-window recompute
  // and the `processed_at` stamp are `apply_payment_event`'s (`0019`), so a failure rolls all four back and
  // the provider retries a delivery that was neither applied nor half-applied. An `ignored` transition still
  // goes through it — the ledger row is what 03 §5.4.3 wants written whether or not the money moves — and
  // carries no patch, which is how the function is told to stamp and write nothing else.
  const applied = await deps.store.applyEvent({
    ...raw,
    familyId,
    ...(transition.handled === "ignored"
      ? {}
      : {
          spinePatch: transition.patch,
          accessAgeYears: PRICES.accessAgeYears,
        }),
  });
  if (!applied.ok) return applied;
  if (applied.value.outcome === "duplicate")
    return ok({ ...ignored(familyId, before), handled: "skipped-duplicate" });
  if (applied.value.outcome === "unresolved")
    return fail(
      "E_EVENT_UNRESOLVED",
      "The spine row this delivery belongs to is gone",
      deps.provider.name,
    );
  // `ignored` is what the function answers when no patch reached it, which is precisely this branch: the
  // transition moved nothing, the delivery is recorded and stamped, and the family's standing is unchanged.
  if (transition.handled === "ignored") return ok(ignored(familyId, before));
  // A patch DID cross the seam, so anything but `applied` here is the database contradicting the transition
  // this spine decided. Refusing lets the provider retry a delivery that was rolled back; reporting a move the
  // function did not make would put the wrong standing in front of the family.
  if (applied.value.outcome !== "applied")
    return fail(
      "E_EVENT_UNRESOLVED",
      "The delivery was recorded without being applied",
      deps.provider.name,
    );
  // What the transaction wrote, without a second round trip to read it back: the patch is the columns
  // `0019` assigns by name, and `access_until` is the one column it does NOT take from the patch — the
  // function returns `set_access_window`'s answer instead, which is why it is merged separately here.
  const after: SpineRow = {
    ...row,
    ...transition.patch,
    ...(applied.value.accessUntil === null
      ? {}
      : { access_until: applied.value.accessUntil }),
  };
  const events = await emitMoneyEvents(deps.events, {
    names: transition.events,
    familyId,
    actor: WEBHOOK_ACTOR,
    ref: event.ref,
    props: {
      path: purchasePath(event),
      providerEventId: event.eventId,
      ...(event.kind === "purchase.completed"
        ? {
            preset: event.preset,
            amountMinor: event.paid.pence,
            shape: event.shape.kind,
          }
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
      after: accessStateFromRow(after, now),
      events: events as ReadonlyArray<EventName>,
      handled: "handled" as const,
    }),
  );
}

const purchasePath = (event: MoneyEvent): "payment-link" | "self-serve" =>
  event.kind === "purchase.completed" && event.linkKind === "checkout"
    ? "self-serve"
    : "payment-link";

/**
 * A delivery that needed nothing: an event type we do not handle, or a `LinkRef` we never minted. The ledger
 * row is written (03 §5.4.3 — the record is the point) and stamped `processed_at` by the **same** statement:
 * no patch crosses the seam, so `apply_payment_event` has no money to move and answers `ignored` (`0020`;
 * ADR-146). One transaction, like every other road out of this file.
 *
 * A failure to record is logged and swallowed on purpose — the delivery genuinely needed nothing, and the
 * answer to the provider is a 200 either way. What the log protects is the runbook's view: a store that cannot
 * write the ledger is an outage, and `ALERT_PROVIDER_DOWN` is how 06 hears about it.
 */
async function recordWithNothingToDo(
  deps: PaymentsDeps,
  raw: RawDelivery,
): Promise<void> {
  const applied = await deps.store.applyEvent(raw);
  if (applied.ok) return;
  log.error("payment event ledger not written", {
    module: "payments",
    action: "webhook",
    alert: "ALERT_PROVIDER_DOWN",
    errorCode: applied.error.code,
  });
}

export function webhookMethod(
  deps: PaymentsDeps,
): Pick<PurchasePath, "handleWebhook"> {
  return {
    handleWebhook: async (raw) => {
      const parsed = deps.provider.parseEvent(raw);
      if (!parsed.ok)
        return fail(
          "E_EVENT_UNVERIFIED",
          "The event is not verified",
          deps.provider.name,
        );
      const event = parsed.value;
      const now = deps.now();
      const delivery: RawDelivery = {
        provider: deps.provider.name,
        providerEventId: event.eventId,
        eventType: event.kind,
        payload: JSON.parse(raw.rawBody) as Json,
        receivedAt: raw.receivedAt,
      };
      // An event type we do not handle needs no family and no transition, so it never reaches the fold.
      if (event.kind === "ignored") {
        await recordWithNothingToDo(deps, delivery);
        return ok(ignored(UNRESOLVED_FAMILY, NONE));
      }
      // **The family is resolved BEFORE the ledger row exists, and that is the reordering ADR-127 forces.**
      // 03 §5.4.3's "insert before dispatch" is honoured more strictly than it was, not less: the insert is
      // now the first statement *inside the transaction that dispatches*. Resolution is a read — it decides
      // nothing and writes nothing — so a replay that reaches it costs one keyed read and is then answered
      // `duplicate` by the function without touching money.
      const row = await resolveFamily(deps, event);
      if (row.ok && row.value === null) {
        log.warn("payment event unresolved: no link we minted", {
          module: "payments",
          action: "webhook",
          provider: deps.provider.name,
        });
        await recordWithNothingToDo(deps, delivery);
        return ok(ignored(UNRESOLVED_FAMILY, NONE));
      }
      // The spine could not be read at all: nothing is recorded, because recording a delivery we have not
      // decided would stamp it as seen. A 5xx is the provider's cue to send it again.
      if (!row.ok) return carryStoreError(row.error);
      const found = row.value as SpineRow;
      const outcome = await applyTransition(deps, found, event, delivery, now);
      return outcome.ok ? outcome : carryStoreError(outcome.error);
    },
  };
}
