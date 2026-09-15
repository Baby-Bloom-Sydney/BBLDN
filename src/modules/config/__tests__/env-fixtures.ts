// Fixtures for the config.env suite: the CI placeholder env (the workflow's top-level `env:` block) and
// `.env.test` (05 §4.3 — parsed by the same schema, no second code path). Values are placeholders, never secrets.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type RawEnv = Readonly<Record<string, string | undefined>>;

const REPO_ROOT = resolve(__dirname, "../../../..");

function stripComment(line: string): string {
  return line.replace(/\s+#.*$/, "").trim();
}

function unquote(value: string): string {
  return value.replace(/^"(.*)"$/, "$1");
}

/** The top-level `env:` block of .github/workflows/ci.yml (between `env:` and `jobs:`). */
export function loadCiPlaceholderEnv(): RawEnv {
  const yaml = readFileSync(
    resolve(REPO_ROOT, ".github/workflows/ci.yml"),
    "utf8",
  );
  const block = yaml.split(/^env:\s*$/m)[1]?.split(/^jobs:\s*$/m)[0] ?? "";
  return Object.fromEntries(
    block
      .split("\n")
      .map(stripComment)
      .filter((line) => line !== "" && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf(":");
        return [
          line.slice(0, index).trim(),
          unquote(line.slice(index + 1).trim()),
        ];
      }),
  );
}

/** `.env.test` as KEY=VALUE lines. */
export function loadDotEnvTest(): RawEnv {
  const text = readFileSync(resolve(REPO_ROOT, ".env.test"), "utf8");
  return Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), unquote(line.slice(index + 1))];
      }),
  );
}

/** A production-shaped env derived from `.env.test`: live Stripe mode, real provider bindings, no dev-only names. */
export function productionEnvFrom(base: RawEnv): RawEnv {
  const {
    STUB_EVENT_SECRET: _stub,
    EMAIL_DEV_DRY_RUN: _dry,
    NEXT_PUBLIC_DEV_MODE: _dev,
    NEXT_PUBLIC_SKIP_INTRO_WAIT: _skip,
    NEXT_PUBLIC_FUNNEL_LOG: _log,
    ...rest
  } = base;
  return {
    ...rest,
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    RESEND_API_KEY: "re_placeholder",
    OPENAI_API_KEY: "placeholder-openai",
    GOOGLE_AI_API_KEY: "placeholder-google",
    PURCHASE_PROVIDER: "stripe-uk",
    EMAIL_PROVIDER: "resend",
    AREAS_SOURCE: "db",
    STRIPE_MODE: "live",
    STRIPE_SECRET_KEY: "rk_live_ci-dummy",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_ci-dummy",
    NEXT_PUBLIC_META_PIXEL_ID: "0",
    META_CAPI_ACCESS_TOKEN: "placeholder-capi",
    META_DATASET_ID: "0",
    SENTRY_DSN: "https://placeholder@sentry.example.test/1",
    NEXT_PUBLIC_SENTRY_DSN: "https://placeholder@sentry.example.test/1",
    ALERT_WEBHOOK_URL: "https://hooks.example.test/alert",
  };
}
