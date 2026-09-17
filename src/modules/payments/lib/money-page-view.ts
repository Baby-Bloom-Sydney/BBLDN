// The one place an `AccessState` becomes words a parent reads (04 §6.2 rows S-P-10 / S-P-11 / S-P-12). Pure:
// state in, view out, no clock of its own and no I/O — so every state in the register is a unit test rather than
// a screenshot, and the wording is checked by the copy suite over this file rather than over three components.
//
// **The words, and why these ones** (00-glossary §6 / §8; ADR-124). Banned in anything a parent reads:
// *price* · *fee* · *free* · *offer* · *upgrade* · *continue* · *information* · *alternative* · *book*. So:
// the amount is "what's left to pay" and never a fee; the self-serve route is never "free" (ADR-082) and never
// an *alternative* to the done-for-you one (P-4); "the bundle", never a subscription, a plan or a package;
// "until your child turns 3" (ADR-083), never lifetime or forever; "upfront, or {n} monthly payments", never
// instalments. The deposit is "held" and "comes off the final amount" because that is exactly what it does
// (ADR-097) — it opens nothing.
import { LOCALE, PRICES } from "@/modules/config";
import type { Money } from "@/modules/purchase-paths";
import type { Instant } from "@/modules/shared-types";
import type { AccessState } from "../types";
import { formatMoney } from "./format-money";

/** One fact beside the headline: a date, an amount, a count. */
export type MoneyFact = { readonly label: string; readonly value: string };

/** What the screen invites the parent to do, if anything. The route turns this into a form or a link. */
export type MoneyAction =
  | { readonly kind: "none" }
  /** S-P-11 only — the two shapes of the self-serve app, from `PRICES` (L4). */
  | { readonly kind: "choose-shape" }
  /** The hosted portal: change the card, or stop the monthly payments. */
  | { readonly kind: "manage" }
  /** Nothing the parent can do here; her matchmaker sends the payment link. */
  | { readonly kind: "ask-matchmaker" };

export type MoneyPageView = {
  /** Matches the `AccessStanding` it was read from, so a test names the state rather than matching prose. */
  readonly state: AccessState["state"];
  readonly headline: string;
  readonly body: string;
  readonly facts: ReadonlyArray<MoneyFact>;
  readonly action: MoneyAction;
  /** True while the app is open for this family — the rail and the paywall read this, not the standing. */
  readonly open: boolean;
};

const ACCESS_LINE = `Your bundle stays open until your youngest child turns ${PRICES.accessAgeYears}, and it covers every child you have after that.`;

const day = (at: Instant | string): string =>
  new Intl.DateTimeFormat(LOCALE.locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: LOCALE.timezone,
  }).format(new Date(at));

const untilFact = (until: Instant | null): ReadonlyArray<MoneyFact> =>
  until === null ? [] : [{ label: "Open until", value: day(until) }];

const depositFact = (state: AccessState): ReadonlyArray<MoneyFact> =>
  state.deposit === undefined || state.deposit.refundedAt !== undefined
    ? []
    : [
        {
          label: "Deposit held",
          value: formatMoney({
            pence: state.deposit.pence,
            currency: LOCALE.currency,
          }),
        },
      ];

const money = (value: Money): string => formatMoney(value);

function placed(
  state: Extract<AccessState, { state: "placed" }>,
): MoneyPageView {
  const left = money(state.balance);
  return {
    state: "placed",
    headline: "Your app is on",
    body: `It switched on the day your nanny started. What's left to pay is ${left}, due on ${day(state.paymentDueAt)} — your deposit and your nanny's first week are already taken off. Your matchmaker sends you the payment link; there is nothing to do here until it arrives.`,
    facts: [
      { label: "Due", value: day(state.paymentDueAt) },
      { label: "Left to pay", value: left },
      {
        label: "Nanny's first week",
        value: money(state.firstWeekWages),
      },
      {
        label: "Tell us if it's not right by",
        value: day(state.satisfactionWindowEndsAt),
      },
      ...depositFact(state),
      ...untilFact(state.accessUntil),
    ],
    action: { kind: "ask-matchmaker" },
    open: true,
  };
}

function active(
  state: Extract<AccessState, { state: "active" }>,
): MoneyPageView {
  const monthly = state.shape.kind === "instalments";
  const late = state.standing === "past-due";
  return {
    state: "active",
    headline: late ? "A payment didn't go through" : "Your bundle is open",
    body: late
      ? `We couldn't take the last payment. Update your card and we'll try again${state.graceUntil === undefined ? "" : ` — your app stays on until ${day(state.graceUntil)}`}.`
      : state.cancelledAt === undefined
        ? ACCESS_LINE
        : `You've stopped the monthly payments. Your app stays on until the end of the month you've paid for.`,
    facts: [
      ...(monthly
        ? [
            {
              label: "Payments made",
              value: `${state.paidCount} of ${state.paidCount + state.remaining}`,
            },
          ]
        : []),
      ...(state.nextPaymentAt === null
        ? []
        : [{ label: "Next payment", value: day(state.nextPaymentAt) }]),
      ...depositFact(state),
      ...untilFact(state.accessUntil),
    ],
    action: { kind: "manage" },
    open: true,
  };
}

function lapsed(
  state: Extract<AccessState, { state: "lapsed" }>,
): MoneyPageView {
  const why =
    state.reason === "trial-ended"
      ? "Your month with the app has ended."
      : state.reason === "past-due"
        ? "We couldn't take your last payment, so the app is closed for now."
        : state.reason === "cancelled"
          ? "Your bundle has come to an end."
          : "Your bundle has run its course — your youngest is past three.";
  return {
    state: "lapsed",
    headline: "The app is closed",
    body: `${why} You can open it again whenever you're ready.`,
    facts: [
      { label: "Closed on", value: day(state.lapsedAt) },
      ...depositFact(state),
    ],
    action:
      state.reason === "access-ended"
        ? { kind: "none" }
        : { kind: "choose-shape" },
    open: false,
  };
}

export function moneyPageView(state: AccessState): MoneyPageView {
  switch (state.state) {
    case "none":
      return {
        state: "none",
        headline: "Nothing to pay yet",
        body: "When your matchmaker has someone for you, this is where you'll see what's owed and when.",
        facts: [],
        action: { kind: "choose-shape" },
        open: false,
      };
    case "deposit-paid":
      return {
        state: "deposit-paid",
        headline: "Your deposit is held",
        body: `We're holding ${money({ pence: state.pence, currency: LOCALE.currency })} to keep your place. It comes off the final amount, and you get it back if you change your mind inside the window we agreed. The app itself switches on the day your nanny starts.`,
        facts: [
          {
            label: "Deposit held",
            value: money({ pence: state.pence, currency: LOCALE.currency }),
          },
          { label: "Held since", value: day(state.depositPaidAt) },
        ],
        action: { kind: "ask-matchmaker" },
        open: false,
      };
    case "placed":
      return placed(state);
    case "trial":
      return {
        state: "trial",
        headline: "Your app is open",
        body: `You have the app for a month to try with your family. ${ACCESS_LINE}`,
        facts: [
          { label: "This month runs to", value: day(state.trialEndsAt) },
          ...untilFact(state.accessUntil),
        ],
        action: { kind: "choose-shape" },
        open: true,
      };
    case "active":
      return active(state);
    case "paid-in-full":
      return {
        state: "paid-in-full",
        headline: "All paid",
        body: ACCESS_LINE,
        facts: [
          { label: "Paid on", value: day(state.paidAt) },
          ...depositFact(state),
          ...untilFact(state.accessUntil),
        ],
        action: { kind: "none" },
        open: true,
      };
    case "toggled":
      return {
        state: "toggled",
        headline: state.on ? "Your app is on" : "The app is closed",
        body: state.on
          ? `Your matchmaker has switched the app on for you.${state.until === undefined ? "" : ` It stays on until ${day(state.until)}.`}`
          : "Your matchmaker has switched the app off. Get in touch and we'll sort it out.",
        facts: [
          ...(state.until === undefined
            ? []
            : [
                {
                  label: state.on ? "On until" : "Until",
                  value: day(state.until),
                },
              ]),
          ...depositFact(state),
          ...untilFact(state.accessUntil),
        ],
        action: { kind: "ask-matchmaker" },
        open: state.on,
      };
    case "lapsed":
      return lapsed(state);
  }
}
