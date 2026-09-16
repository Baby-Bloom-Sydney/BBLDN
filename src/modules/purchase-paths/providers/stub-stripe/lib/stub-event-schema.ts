// The zod shape a stub provider event must satisfy before it is dispatched (security-review: validate once, at
// the boundary, with a whitelist). The stub synthesises these from the admin panel and posts them through the
// **same** `handleWebhook` as a real provider (03 §5.5), so anything sloppy here would reach the money spine.
import { z } from "zod";

const MAX_ID = 128;
const money = z.object({
  pence: z.number().int().nonnegative(),
  currency: z.literal("GBP"), // config-literal-ok: the boundary must reject any other currency; the literal is 03 §5.2's type
});
const plan = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("upfront") }),
  z.object({ kind: z.literal("instalments"), count: z.number().int().min(1) }),
]);
const eventId = z.string().min(1).max(MAX_ID);
const ref = z.string().min(1).max(MAX_ID);
const at = z.string().min(1).max(MAX_ID);
const linkKind = z.enum([
  "deposit",
  "balance-after-week-1",
  "custom",
  "checkout",
]);
const preset = z.enum([
  "deposit",
  "balance-after-week-1",
  "self-serve-app",
  "custom",
]);

export const STUB_EVENT_SCHEMA = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("purchase.completed"),
    eventId,
    ref,
    linkKind,
    preset,
    shape: plan,
    paid: money,
    at,
  }),
  z.object({
    kind: z.literal("instalment.paid"),
    eventId,
    ref,
    index: z.number().int().min(1),
    paid: money,
    at,
  }),
  z.object({
    kind: z.literal("instalment.failed"),
    eventId,
    ref,
    index: z.number().int().min(1),
    at,
  }),
  z.object({
    kind: z.literal("schedule.cancelled"),
    eventId,
    ref,
    at,
    paidCount: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("refunded"),
    eventId,
    ref,
    amount: money,
    at,
  }),
  z.object({
    kind: z.literal("ignored"),
    eventId,
    providerType: z.string().min(1).max(MAX_ID),
  }),
]);
