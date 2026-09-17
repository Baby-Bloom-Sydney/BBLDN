// Path (a) `createPaymentLink` (admin only; 03 §5.4.1), path (b) `createCheckout` (the parent; §5.4.2) and the
// hosted `portal`. Both paths mint the `LinkRef` **here** (never the provider), write it on the row before the
// provider is called, and hand the provider an amount computed from `PRICES` and the family's own row —
// `feePence − deposit paid − first-week wages` for the bill (ADR-094 / 097 / 100), a preset otherwise.
import { LOCALE, PRICES } from "@/modules/config";
import { ok } from "@/modules/platform";
import type {
  CheckoutReturnTo,
  LinkKind,
  Money,
  PlanShape,
  PricePreset,
} from "@/modules/purchase-paths";
import type {
  Actor,
  CustomerRef,
  Email,
  FamilyId,
  Instant,
  LinkRef,
  PlacementId,
  Url,
} from "@/modules/shared-types";
import type { PaymentsResult, PurchasePath } from "../types";
import { addDays } from "./add-days";
import { balancePence } from "./balance-pence";
import type { PaymentsDeps } from "./deps";
import { emitMoneyEvents } from "./emit-money-events";
import { fail } from "./fail";
import { firstWeekWagesPence } from "./first-week-wages-pence";
import { mintLinkRef } from "./mint-link-ref";
import { sendPaymentLinkEmail } from "./send-payment-link-email";
import type { FamilyContact, SpinePatch, SpineRow } from "./spine-store";

const money = (pence: number): Money => ({ pence, currency: LOCALE.currency });

type Bill = { readonly amount: Money; readonly wages: number };
type Customer = {
  readonly customer: CustomerRef;
  readonly contact: FamilyContact | null;
};

const ownFamily = (actor: Actor, familyId: FamilyId): boolean =>
  actor.kind !== "user" || actor.id === familyId;

const providerRefused = (deps: PaymentsDeps) =>
  fail("E_PROVIDER", "The payment provider refused", deps.provider.name);

/** The provider's customer for this family — minted from the contact on file, never from caller input. */
async function customerFor(
  deps: PaymentsDeps,
  familyId: FamilyId,
): Promise<PaymentsResult<Customer>> {
  const contact = await deps.store.familyContact(familyId);
  const found = contact.ok ? contact.value : null;
  const customer = await deps.provider.ensureCustomer({
    id: familyId,
    email: (found?.email ?? "") as Email,
    name: found?.firstName ?? "",
  });
  if (!customer.ok) return providerRefused(deps);
  return ok({ customer: customer.value, contact: found });
}

/** The bill for a placed family — the deposit credited, the first week discounted, from the contract (ADR-100). */
async function billOf(deps: PaymentsDeps, row: SpineRow): Promise<Bill> {
  const terms =
    row.placement_id === null
      ? null
      : await deps.store.placementTerms(row.placement_id as PlacementId);
  const wages = firstWeekWagesPence(
    terms !== null && terms.ok ? terms.value : null,
  );
  const depositPaid =
    row.deposit_paid_at === null ? 0 : (row.deposit_pence ?? 0);
  return {
    amount: money(balancePence(PRICES.feePence, depositPaid, wages)),
    wages,
  };
}

async function amountFor(
  deps: PaymentsDeps,
  row: SpineRow,
  kind: LinkKind,
  custom: Money | undefined,
): Promise<PaymentsResult<Bill>> {
  if (kind === "deposit")
    return ok({ amount: money(PRICES.depositPence), wages: 0 });
  if (kind === "custom") {
    const whole =
      custom !== undefined && Number.isInteger(custom.pence) && custom.pence > 0;
    if (!whole || custom === undefined)
      return fail("E_PLAN_INVALID", "A custom link needs a whole amount");
    return ok({ amount: custom, wages: 0 });
  }
  const due =
    row.status === "placed" &&
    row.payment_due_at !== null &&
    row.payment_due_at <= deps.now();
  if (!due) return fail("E_PAYMENT_NOT_DUE", "The bill is not due yet");
  return ok(await billOf(deps, row));
}

function linkPatch(kind: LinkKind, ref: LinkRef, bill: Bill): SpinePatch {
  if (kind === "deposit")
    return { deposit_link_ref: ref, deposit_pence: PRICES.depositPence };
  if (kind === "custom") return { price_preset: "custom" };
  return {
    balance_link_ref: ref,
    balance_pence: bill.amount.pence,
    first_week_wages_pence: bill.wages,
    price_preset: "balance-after-week-1",
  };
}

type MintedLink = {
  readonly url: Url;
  readonly reference: LinkRef;
  readonly expiresAt: Instant;
  readonly contact: FamilyContact | null;
  readonly amount: Money;
};

async function mintLink(
  deps: PaymentsDeps,
  row: SpineRow,
  kind: LinkKind,
  plan: PlanShape,
  custom: Money | undefined,
): Promise<PaymentsResult<MintedLink>> {
  const familyId = row.parent_user_id as FamilyId;
  const bill = await amountFor(deps, row, kind, custom);
  if (!bill.ok) return bill;
  const reference = mintLinkRef(familyId, kind);
  const expiresAt = addDays(deps.now(), PRICES.linkTtlDays);
  const written = await deps.store.updateSpine(
    row.id,
    linkPatch(kind, reference, bill.value),
  );
  if (!written.ok) return written;
  const who = await customerFor(deps, familyId);
  if (!who.ok) return who;
  const link = await deps.provider.createPaymentLink(
    who.value.customer,
    bill.value.amount,
    kind,
    plan,
    reference,
    expiresAt,
  );
  if (!link.ok) return providerRefused(deps);
  return ok({
    url: link.value.url,
    reference,
    expiresAt,
    contact: who.value.contact,
    amount: bill.value.amount,
  });
}

async function createPaymentLink(
  deps: PaymentsDeps,
  familyId: FamilyId,
  kind: LinkKind,
  plan: PlanShape,
  actor: Actor,
  custom?: Money,
): Promise<ReturnType<PurchasePath["createPaymentLink"]>> {
  if (actor.kind !== "admin")
    return fail("E_ACTOR_FORBIDDEN", "Only an admin may send a link");
  if (!deps.paymentsEnabled())
    return fail("E_PAYMENTS_DISABLED", "Payments are switched off");
  const found = await deps.store.readByFamily(familyId, "service");
  if (!found.ok) return found;
  if (found.value === null) return fail("E_FAMILY_NOT_FOUND", "No family");
  const minted = await mintLink(deps, found.value, kind, plan, custom);
  if (!minted.ok) return minted;
  const { url, reference, expiresAt, contact, amount } = minted.value;
  await emitMoneyEvents(deps.events, {
    names: ["bundle.link-sent"],
    familyId,
    actor,
    ref: reference,
    props: {
      path: "payment-link",
      linkKind: kind,
      amountMinor: amount.pence,
      shape: plan.kind,
    },
  });
  await sendPaymentLinkEmail(deps.comms, {
    familyId,
    contact,
    url,
    amount,
    expiresAt,
    kind,
  });
  return ok({ url, reference, expiresAt });
}

const returnTo = (appUrl: string): CheckoutReturnTo => ({
  success: `${appUrl}/parent/subscription` as Url,
  cancel: `${appUrl}/parent/subscribe` as Url,
});

async function createCheckout(
  deps: PaymentsDeps,
  familyId: FamilyId,
  preset: PricePreset,
  plan: PlanShape,
  actor: Actor,
): Promise<ReturnType<PurchasePath["createCheckout"]>> {
  if (!ownFamily(actor, familyId))
    return fail("E_ACTOR_FORBIDDEN", "Not this family");
  if (!deps.paymentsEnabled())
    return fail("E_PAYMENTS_DISABLED", "Payments are switched off");
  if (preset === "deposit" || preset === "custom")
    return fail("E_PLAN_INVALID", "Not a checkout preset");
  const found = await deps.store.readByFamily(familyId, "service");
  if (!found.ok) return found;
  const row = found.value;
  if (row?.status === "active" || row?.status === "paid_in_full")
    return fail("E_ALREADY_PAID", "Already paid");
  if (preset === "balance-after-week-1" && row?.status !== "placed")
    return fail("E_PAYMENT_NOT_DUE", "The bill is not due yet");
  const who = await customerFor(deps, familyId);
  if (!who.ok) return who;
  const checkout = await deps.provider.createCheckout(
    who.value.customer,
    preset,
    plan,
    mintLinkRef(familyId, "checkout"),
    returnTo(deps.appUrl),
  );
  if (!checkout.ok) return providerRefused(deps);
  return ok({ url: checkout.value.url });
}

export function linkMethods(
  deps: PaymentsDeps,
): Pick<PurchasePath, "createPaymentLink" | "createCheckout" | "portal"> {
  return {
    createPaymentLink: (familyId, kind, plan, actor, custom) =>
      createPaymentLink(deps, familyId, kind, plan, actor, custom),
    createCheckout: (familyId, preset, plan, actor) =>
      createCheckout(deps, familyId, preset, plan, actor),
    portal: async (familyId, actor) => {
      if (!ownFamily(actor, familyId))
        return fail("E_ACTOR_FORBIDDEN", "Not this family");
      const who = await customerFor(deps, familyId);
      if (!who.ok) return who;
      const portal = await deps.provider.portal(
        who.value.customer,
        returnTo(deps.appUrl).success,
      );
      if (!portal.ok) return providerRefused(deps);
      return ok(portal.value);
    },
  };
}
