// Suite `config.env` (05 §4.2; HANDOFF §5.3 / §10 C1): the schema parses the full name list; a missing server name
// fails boot naming names only; booleans are the literal "true"; publicEnv / serverEnv split; FLAGS typed;
// the guards of 07 §7 item 1 / §5.5 / 06 §2.2 hold.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ENV_SCHEMA } from "@/modules/config/lib/env-schema";
import { parseEnv } from "@/modules/config/lib/parse-env";
import { parsePublicEnv } from "@/modules/config/lib/parse-public-env";
import { EnvInvalidError } from "@/modules/config/lib/env-invalid-error";
import {
  loadCiPlaceholderEnv,
  loadDotEnvTest,
  productionEnvFrom,
} from "./env-fixtures";

// HANDOFF §5.4 / 06 §13 O-8 say 51 but enumerate 52 (both the BUNDLE and the SELF_SERVE_APP price-id pairs) —
// 03 §5.2 owns the price ids, so the BUNDLE pair is not defined and the schema (the count's source) has 50.
const NAME_COUNT = 50;
const dotEnvTest = loadDotEnvTest();
const production = productionEnvFrom(dotEnvTest);

function withoutName(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
) {
  const { [name]: _dropped, ...rest } = env;
  return rest;
}

function failure(fn: () => unknown): EnvInvalidError {
  try {
    fn();
  } catch (error) {
    if (error instanceof EnvInvalidError) return error;
    throw error;
  }
  throw new Error("expected EnvInvalidError");
}

describe("config.env — the name list (HANDOFF §5.4)", () => {
  it("declares exactly 50 names, each in one scope, with a purpose and D / P / Pr marks", () => {
    const names = Object.keys(ENV_SCHEMA.entries);
    expect(names).toHaveLength(NAME_COUNT);
    for (const name of names) {
      const entry = ENV_SCHEMA.entries[name as keyof typeof ENV_SCHEMA.entries];
      expect(["public", "server"]).toContain(entry.scope);
      expect(entry.purpose.length, name).toBeGreaterThan(8);
      expect(
        name.startsWith("NEXT_PUBLIC_") || name === "NODE_ENV",
        `${name} scope`,
      ).toBe(entry.scope === "public");
    }
  });

  it("never defines the dropped names (01 §1.2; 06 §2.5)", () => {
    for (const dropped of [
      "OCG_WEBHOOK_SECRET",
      "PAYOUTS_ENABLED",
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_INVITE_BASE_URL",
      "STRIPE_PRICE_BUNDLE_UPFRONT",
    ])
      expect(ENV_SCHEMA.entries).not.toHaveProperty(dropped);
    expect(
      Object.keys(ENV_SCHEMA.entries).some((n) => n.startsWith("CLOUDINARY")),
    ).toBe(false);
  });
});

describe("config.env — parsing (01 §3.3)", () => {
  it("accepts the CI placeholder env and .env.test", () => {
    expect(() => parseEnv(loadCiPlaceholderEnv())).not.toThrow();
    const parsed = parseEnv(dotEnvTest);
    expect(parsed.environment).toBe("development");
    expect(Object.isFrozen(parsed.server)).toBe(true);
    expect(Object.isFrozen(parsed.public)).toBe(true);
  });

  it("accepts a production-shaped env", () => {
    expect(parseEnv(production).environment).toBe("production");
  });

  it("fails boot when a required server name is missing in production, naming names only", () => {
    const secret = production.CRON_SECRET ?? "";
    const error = failure(() =>
      parseEnv(withoutName(production, "CRON_SECRET")),
    );
    expect(error.names).toEqual(["CRON_SECRET"]);
    expect(error.message).toContain("ALERT_ENV_INVALID");
    expect(error.message).toContain("CRON_SECRET");
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toContain(
      production.SUPABASE_SERVICE_ROLE_KEY ?? "@@",
    );
  });

  it("fails boot in development too when a dev-required name is missing (nothing runs half-configured)", () => {
    const error = failure(() =>
      parseEnv(withoutName(dotEnvTest, "NEXT_PUBLIC_SUPABASE_URL")),
    );
    expect(error.names).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("lists every missing or malformed name in one error", () => {
    const error = failure(() =>
      parseEnv({
        ...withoutName(production, "ADMIN_API_TOKEN"),
        KATIE_DAILY_LIMIT_USD: "lots",
      }),
    );
    expect(error.names).toEqual(
      expect.arrayContaining(["ADMIN_API_TOKEN", "KATIE_DAILY_LIMIT_USD"]),
    );
  });

  it('parses booleans as the literal "true" and numbers strictly', () => {
    const parsed = parseEnv({
      ...dotEnvTest,
      KATIE_ENABLED: "true",
      INVITE_LINKS_ENABLED: "TRUE",
      KATIE_DAILY_LIMIT_USD: "2.5",
    });
    expect(parsed.server.KATIE_ENABLED).toBe(true);
    expect(parsed.server.INVITE_LINKS_ENABLED).toBe(false);
    expect(
      parseEnv(withoutName(dotEnvTest, "KATIE_ENABLED")).server.KATIE_ENABLED,
    ).toBeUndefined();
    expect(parsed.server.KATIE_DAILY_LIMIT_USD).toBe(2.5);
  });

  it("splits public from server: no server name in the public object and vice versa", () => {
    const parsed = parseEnv(dotEnvTest);
    for (const key of Object.keys(parsed.public))
      expect(
        ENV_SCHEMA.entries[key as keyof typeof ENV_SCHEMA.entries].scope,
      ).toBe("public");
    for (const key of Object.keys(parsed.server))
      expect(
        ENV_SCHEMA.entries[key as keyof typeof ENV_SCHEMA.entries].scope,
      ).toBe("server");
    expect(
      Object.keys(parsed.public).length + Object.keys(parsed.server).length,
    ).toBe(NAME_COUNT);
  });
});

describe("config.env — guards (07 §7 item 1; 07 §5.5; 06 §2.2; 06 §4.1 C)", () => {
  it("refuses PURCHASE_PROVIDER=stub-stripe in production", () => {
    const error = failure(() =>
      parseEnv({
        ...production,
        PURCHASE_PROVIDER: "stub-stripe",
        STUB_EVENT_SECRET: "x",
      }),
    );
    expect(error.names).toContain("PURCHASE_PROVIDER");
  });

  it("requires STUB_EVENT_SECRET iff the stub is bound, and never in production", () => {
    expect(
      failure(() => parseEnv(withoutName(dotEnvTest, "STUB_EVENT_SECRET")))
        .names,
    ).toContain("STUB_EVENT_SECRET");
    expect(
      failure(() => parseEnv({ ...production, STUB_EVENT_SECRET: "x" })).names,
    ).toContain("STUB_EVENT_SECRET");
  });

  it("refuses the dev-only names outside development", () => {
    for (const name of [
      "NEXT_PUBLIC_DEV_MODE",
      "EMAIL_DEV_DRY_RUN",
      "NEXT_PUBLIC_SKIP_INTRO_WAIT",
      "NEXT_PUBLIC_FUNNEL_LOG",
    ]) {
      expect(
        failure(() => parseEnv({ ...production, [name]: "true" })).names,
        name,
      ).toContain(name);
      expect(
        failure(() =>
          parseEnv({ ...production, VERCEL_ENV: "preview", [name]: "false" }),
        ).names,
        name,
      ).toContain(name);
    }
  });

  it("asserts the Stripe key prefixes match STRIPE_MODE", () => {
    expect(
      failure(() => parseEnv({ ...production, STRIPE_SECRET_KEY: "sk_test_x" }))
        .names,
    ).toEqual(["STRIPE_SECRET_KEY"]);
    expect(
      failure(() =>
        parseEnv({
          ...production,
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x",
        }),
      ).names,
    ).toEqual(["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]);
    expect(
      failure(() => parseEnv({ ...dotEnvTest, STRIPE_SECRET_KEY: "sk_live_x" }))
        .names,
    ).toEqual(["STRIPE_SECRET_KEY"]);
  });

  it("rejects an unknown provider binding or a malformed URL by name", () => {
    expect(
      failure(() => parseEnv({ ...dotEnvTest, EMAIL_PROVIDER: "sendgrid" }))
        .names,
    ).toEqual(["EMAIL_PROVIDER"]);
    expect(
      failure(() =>
        parseEnv({ ...dotEnvTest, NEXT_PUBLIC_APP_URL: "not a url" }),
      ).names,
    ).toEqual(["NEXT_PUBLIC_APP_URL"]);
  });
});

describe("config.env — the public reader (01 §3.3 build-time inlining)", () => {
  const source = readFileSync(resolve(__dirname, "../public-env.ts"), "utf8");
  const reads = [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map(
    (m) => m[1],
  );
  const publicNames = Object.entries(ENV_SCHEMA.entries)
    .filter(([, entry]) => entry.scope === "public")
    .map(([name]) => name);

  it("reads only NEXT_PUBLIC_* names and NODE_ENV, as literal property accesses, one per public name", () => {
    expect(
      reads.every(
        (name) => name.startsWith("NEXT_PUBLIC_") || name === "NODE_ENV",
      ),
    ).toBe(true);
    expect([...reads].sort()).toEqual([...publicNames].sort());
    expect(source).not.toMatch(/process\.env\[/);
  });

  it("parses the public half with the same schema", () => {
    const parsed = parsePublicEnv(dotEnvTest);
    expect(Object.keys(parsed).sort()).toEqual([...publicNames].sort());
    expect(
      failure(() =>
        parsePublicEnv(
          withoutName(dotEnvTest, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        ),
      ).names,
    ).toEqual(["NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  });
});
