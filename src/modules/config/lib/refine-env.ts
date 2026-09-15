// Cross-field guards on the parsed values (07 §7 item 1; 07 §5.5; 06 §2.2; 06 §4.1 C). Returns the offending
// NAMES; the caller turns them into one EnvInvalidError. Values never leave this function.
import type { EnvEntry, Environment } from "../types";
import { ENV_SCHEMA } from "./env-schema";

const ENTRIES = Object.entries(ENV_SCHEMA.entries) as ReadonlyArray<
  readonly [string, EnvEntry]
>;

type Parsed = Readonly<Record<string, unknown>>;

function devOnlyNamesPresent(
  values: Parsed,
  environment: Environment,
): string[] {
  if (environment === "development") return [];
  return ENTRIES.filter(
    ([name, entry]) => entry.devOnly && values[name] !== undefined,
  ).map(([name]) => name);
}

function stubGuardNames(values: Parsed, environment: Environment): string[] {
  const isStub = values.PURCHASE_PROVIDER === "stub-stripe";
  const hasSecret = values.STUB_EVENT_SECRET !== undefined;
  const names: string[] = [];
  if (isStub && environment === "production") names.push("PURCHASE_PROVIDER");
  if (isStub && !hasSecret) names.push("STUB_EVENT_SECRET");
  if (hasSecret && environment === "production")
    names.push("STUB_EVENT_SECRET");
  return names;
}

function stripePrefixNames(values: Parsed): string[] {
  const mode = values.STRIPE_MODE;
  if (mode !== "test" && mode !== "live") return [];
  const names: string[] = [];
  const secret = values.STRIPE_SECRET_KEY;
  if (
    typeof secret === "string" &&
    !secret.startsWith(`sk_${mode}_`) &&
    !secret.startsWith(`rk_${mode}_`)
  )
    names.push("STRIPE_SECRET_KEY");
  const publishable = values.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (typeof publishable === "string" && !publishable.startsWith(`pk_${mode}_`))
    names.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  return names;
}

export function refineEnv(
  values: Parsed,
  environment: Environment,
): ReadonlyArray<string> {
  return [
    ...devOnlyNamesPresent(values, environment),
    ...stubGuardNames(values, environment),
    ...stripePrefixNames(values),
  ];
}
