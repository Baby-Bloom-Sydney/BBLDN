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

/**
 * ADR-141 (REVIEW-2 H-11 / M-9) — the other two stub bindings, refused in production for the reason
 * `PURCHASE_PROVIDER` already is. `stub-email` records a send and delivers nothing, so every reset, invite and
 * app-ready mail reports as sent while nothing leaves the building; `AREAS_SOURCE=stub` is the 20-area seed of
 * 03 §6.3, which answers "out of area" for 271 of the 291 real London districts — fail-closed, but for an
 * invisible reason. A production deployment that names either does not boot.
 */
function productionStubProviderNames(
  values: Parsed,
  environment: Environment,
): string[] {
  if (environment !== "production") return [];
  const names: string[] = [];
  if (values.EMAIL_PROVIDER === "stub-email") names.push("EMAIL_PROVIDER");
  if (values.AREAS_SOURCE === "stub") names.push("AREAS_SOURCE");
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

/**
 * Two names are key material or a Bearer, and the registry says `kind: "string"` for both — which is `min(1)`,
 * so nothing stopped a deployed environment carrying a passphrase somebody typed (security pass MEDIUM,
 * 2026-09-19).
 *
 * `CRON_SECRET` is the Bearer every `/api/cron/*` route compares against. It briefly carried a second property —
 * the visitor cookie's signing key was derived from it by HKDF — and **ADR-178 has since split that off** onto
 * `VISITOR_COOKIE_SECRET`, so the two trust domains rotate and leak apart. The floor stays on both: a Bearer
 * somebody typed is the same defect whether or not a second use hangs off it, and an HMAC key is key material by
 * definition.
 *
 * 32 characters is a 128-bit value in hex and a 192-bit one in base64url, so it is the smallest length that
 * cannot be met by a passphrase somebody typed. Development is exempt on purpose — a local stack is not a place
 * to make anyone invent secrets, and every deployed environment is preview or production.
 */
const SECRET_MIN_LENGTH = 32;

/** The names held to `SECRET_MIN_LENGTH` outside development; both are required in every environment. */
const KEY_MATERIAL_NAMES = ["CRON_SECRET", "VISITOR_COOKIE_SECRET"] as const;

function keyMaterialStrengthNames(
  values: Parsed,
  environment: Environment,
): string[] {
  if (environment === "development") return [];
  return KEY_MATERIAL_NAMES.filter((name) => {
    const secret = values[name];
    return typeof secret === "string" && secret.length < SECRET_MIN_LENGTH;
  });
}

export function refineEnv(
  values: Parsed,
  environment: Environment,
): ReadonlyArray<string> {
  return [
    ...devOnlyNamesPresent(values, environment),
    ...stubGuardNames(values, environment),
    ...productionStubProviderNames(values, environment),
    ...stripePrefixNames(values),
    ...keyMaterialStrengthNames(values, environment),
  ];
}
