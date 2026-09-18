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
// 03 §5.2 owns the price ids, so the BUNDLE pair is not defined and the S2 schema (the count's source) had 50.
// P1-FIX (ADR-121) added `VERCEL_GIT_COMMIT_SHA` — Vercel's own system variable, optional everywhere, read for
// `/api/health`'s `sha` because the environment is read only by this module (01 §1.3 rule 1) — so the schema had 51.
// L-009 `3f` (ADR-178) added `VISITOR_COOKIE_SECRET`, required in every environment — so the schema has 52.
const NAME_COUNT = 52;
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
  it("declares exactly 51 names, each in one scope, with a purpose and D / P / Pr marks", () => {
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

describe("config.env — the monitoring names are optional everywhere (ADR-128)", () => {
  const MONITORING = [
    "NEXT_PUBLIC_SENTRY_DSN",
    "SENTRY_DSN",
    "ALERT_WEBHOOK_URL",
  ] as const;
  const withoutMonitoring = (
    env: Readonly<Record<string, string | undefined>>,
  ) =>
    MONITORING.reduce<Readonly<Record<string, string | undefined>>>(
      withoutName,
      env,
    );

  it("marks the three ○ in every column — nothing reads them until the SDK lands", () => {
    for (const name of MONITORING) {
      const entry = ENV_SCHEMA.entries[name];
      expect([entry.dev, entry.preview, entry.prod], name).toEqual([
        "○",
        "○",
        "○",
      ]);
    }
  });

  it("the boot guard accepts a preview env with all three absent", () => {
    const preview = { ...withoutMonitoring(production), VERCEL_ENV: "preview" };
    expect(parseEnv(preview).environment).toBe("preview");
  });

  it("the boot guard accepts a production env with all three absent", () => {
    expect(parseEnv(withoutMonitoring(production)).environment).toBe(
      "production",
    );
  });

  it("the public reader accepts preview and production with the client DSN absent", () => {
    const { NEXT_PUBLIC_SENTRY_DSN: _dsn, ...rest } = production;
    expect(() => parsePublicEnv(rest)).not.toThrow();
    expect(() =>
      parsePublicEnv({ ...rest, VERCEL_ENV: "preview" }),
    ).not.toThrow();
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

  // Security pass MEDIUM (L-009 `3e`): the registry's `kind: "string"` is `min(1)`, so nothing stopped a deployed
  // environment carrying a typed passphrase as a Bearer or as key material. ADR-178 has since split the visitor
  // cookie onto its own secret, so `CRON_SECRET` is back to one property — the floor stays, because a Bearer
  // somebody typed is the same defect whether or not a second use hangs off it, and `VISITOR_COOKIE_SECRET`
  // takes the same floor for the reason the derivation gave it: it is HMAC key material.
  it("★ refuses a CRON_SECRET too short to be key material, in production", () => {
    expect(
      failure(() => parseEnv({ ...production, CRON_SECRET: "short" })).names,
    ).toContain("CRON_SECRET");
  });

  it("★ and in preview, because preview is a deployed environment too", () => {
    expect(
      failure(() =>
        parseEnv({
          ...production,
          VERCEL_ENV: "preview",
          CRON_SECRET: "short",
        }),
      ).names,
    ).toContain("CRON_SECRET");
  });

  it("accepts the length the deployed environments actually carry", () => {
    expect(
      parseEnv(production).server.CRON_SECRET.length,
    ).toBeGreaterThanOrEqual(32);
  });

  // ADR-178 — the visitor cookie's signing key is its own secret. Three claims, each executable: it is required
  // in every environment (so a consent surface cannot silently stop verifying), it carries the same key-material
  // floor, and it is a *different* value from `CRON_SECRET` (the whole point of the split — rotating one must not
  // touch the other, and a leak of one must not forge the other).
  it("★ requires VISITOR_COOKIE_SECRET — in every environment (ADR-178)", () => {
    expect(
      failure(() => parseEnv(withoutName(production, "VISITOR_COOKIE_SECRET")))
        .names,
    ).toContain("VISITOR_COOKIE_SECRET");
    expect(
      failure(() => parseEnv(withoutName(dotEnvTest, "VISITOR_COOKIE_SECRET")))
        .names,
    ).toContain("VISITOR_COOKIE_SECRET");
  });

  it("★ refuses a VISITOR_COOKIE_SECRET too short to be key material", () => {
    expect(
      failure(() => parseEnv({ ...production, VISITOR_COOKIE_SECRET: "short" }))
        .names,
    ).toContain("VISITOR_COOKIE_SECRET");
  });

  it("★ is not CRON_SECRET, and is not derived from it", () => {
    const parsed = parseEnv(production).server;
    expect(parsed.VISITOR_COOKIE_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(parsed.VISITOR_COOKIE_SECRET).not.toBe(parsed.CRON_SECRET);
  });

  // ADR-141 (REVIEW-2 H-11 / M-9): the other two stubs were legal in the production column. `stub-email`
  // reports every reset, invite and app-ready mail as sent while nothing leaves the building; the 20-area seed
  // tells 271 of 291 real London districts they are out of area. Same shape as the guard above.
  it("refuses EMAIL_PROVIDER=stub-email in production", () => {
    expect(
      failure(() => parseEnv({ ...production, EMAIL_PROVIDER: "stub-email" }))
        .names,
    ).toContain("EMAIL_PROVIDER");
  });

  it("refuses AREAS_SOURCE=stub in production", () => {
    expect(
      failure(() => parseEnv({ ...production, AREAS_SOURCE: "stub" })).names,
    ).toContain("AREAS_SOURCE");
  });

  it("leaves both stubs legal outside production", () => {
    const preview = parseEnv({
      ...production,
      VERCEL_ENV: "preview",
      EMAIL_PROVIDER: "stub-email",
      AREAS_SOURCE: "stub",
    });
    expect(preview.server.EMAIL_PROVIDER).toBe("stub-email");
    expect(preview.server.AREAS_SOURCE).toBe("stub");
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

describe("config.env — environment resolution (06 §2.1; fail closed off-Vercel)", () => {
  it("resolves VERCEL_ENV first, then NODE_ENV=production at runtime as production, a build as development", () => {
    // the preview column: its ● names are missing from the dev fixture, so the failure carries the resolved environment
    expect(
      failure(() => parseEnv({ ...dotEnvTest, VERCEL_ENV: "preview" }))
        .environment,
    ).toBe("preview");
    expect(
      failure(() => parseEnv({ ...dotEnvTest, NODE_ENV: "production" }))
        .environment,
    ).toBe("production");
    expect(
      parseEnv({
        ...dotEnvTest,
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
      }).environment,
    ).toBe("development");
    expect(parseEnv({ ...dotEnvTest, NODE_ENV: undefined }).environment).toBe(
      "development",
    );
    expect(
      failure(() => parseEnv({ ...dotEnvTest, VERCEL_ENV: "staging" })).names,
    ).toEqual(["VERCEL_ENV"]);
  });

  it("reads a malformed boolean on a default-on flag as false — the 01 §3.3 rule, pinned so it is a choice, not a surprise", () => {
    expect(
      parseEnv({ ...dotEnvTest, PAYMENTS_ENABLED: "1" }).server
        .PAYMENTS_ENABLED,
    ).toBe(false);
  });
});

describe("config.env — the client reader's import graph carries no server name (07 §7 item 3)", () => {
  const SERVER_ONLY_NAMES = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "RESEND_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_AI_API_KEY",
    "META_CAPI_ACCESS_TOKEN",
    "CRON_SECRET",
    "ADMIN_API_TOKEN",
    "STRIPE_WEBHOOK_SECRET",
    "STUB_EVENT_SECRET",
    "VISITOR_COOKIE_SECRET",
  ];
  const CONFIG_DIR = resolve(__dirname, "..");

  function closure(entry: string, seen = new Set<string>()): Set<string> {
    if (seen.has(entry)) return seen;
    seen.add(entry);
    const source = readFileSync(entry, "utf8");
    for (const match of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
      const target = resolve(
        entry,
        "..",
        `${match[1].replace(/\.ts$/, "")}.ts`,
      );
      closure(target, seen);
    }
    return seen;
  }

  it.each([
    "index.ts",
    "public-env.ts",
    "public-flags.ts",
    "security.ts",
    "urls.ts",
    "domain.ts",
  ])("%s never reaches a file that names a server-only secret", (file) => {
    const files = [...closure(resolve(CONFIG_DIR, file))];
    expect(
      files.some(
        (f) => f.endsWith("/lib/env-schema.ts") || f.endsWith("/env.ts"),
      ),
    ).toBe(false);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const name of SERVER_ONLY_NAMES)
        expect(text, `${f} names ${name}`).not.toContain(name);
    }
  });
});
