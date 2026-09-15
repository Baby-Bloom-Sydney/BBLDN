// The PUBLIC half of the env registry — only the `NEXT_PUBLIC_*` names and NODE_ENV (01 §3.3). Kept in its own
// module so the client reader's import graph (public-env.ts → parse-public-env.ts → here) never carries a server
// name: a bundler cannot tree-shake keys out of a runtime-iterated object, and the bundle string scan (07 §7 item 3)
// fails on the NAME alone. Self-contained (type-only imports) for the generator.
import type { EnvEntry } from "../types";

export const PUBLIC_ENV_ENTRIES = {
  // App
  NEXT_PUBLIC_APP_URL: {
    group: "App",
    scope: "public",
    kind: "url",
    purpose: "the one base URL (01 §3.1 urls.ts; prod = the London domain)",
    dev: "●",
    preview: "●",
    prod: "●",
  },
  NODE_ENV: {
    group: "App",
    scope: "public",
    kind: "enum",
    values: ["development", "test", "production"],
    purpose:
      "set by tooling: development | test | production (absent = development)",
    dev: "●",
    preview: "●",
    prod: "●",
  },
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: {
    group: "Supabase",
    scope: "public",
    kind: "url",
    purpose: "project URL — local / bb-ldn-preview / bb-ldn-prod (ADR-066)",
    dev: "●",
    preview: "●",
    prod: "●",
  },
  NEXT_PUBLIC_SUPABASE_ANON_KEY: {
    group: "Supabase",
    scope: "public",
    kind: "string",
    purpose: "anon key (RLS applies)",
    dev: "●",
    preview: "●",
    prod: "●",
  },
  // Stripe
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: {
    group: "Stripe",
    scope: "public",
    kind: "string",
    purpose: "publishable key (pk_test_ / pk_live_)",
    dev: "●",
    preview: "●",
    prod: "●",
  },
  // Analytics (ADR-055; consent-gated consumer)
  NEXT_PUBLIC_META_PIXEL_ID: {
    group: "Analytics",
    scope: "public",
    kind: "string",
    purpose: "London pixel id",
    dev: "—",
    preview: "—",
    prod: "●",
  },
  // Flags (01 §3.4; read through FLAGS.x only; booleans = the literal "true", absent = the code default)
  NEXT_PUBLIC_KATIE_ENABLED: {
    group: "Flags",
    scope: "public",
    kind: "boolean",
    purpose: "flag KATIE (client mirror)",
    dev: "●",
    preview: "●",
    prod: "●",
  },
  NEXT_PUBLIC_BONUS_PROGRAM_ENABLED: {
    group: "Flags",
    scope: "public",
    kind: "boolean",
    purpose: "flag BONUS_PROGRAM (client mirror) — off",
    dev: "○",
    preview: "○",
    prod: "○",
  },
  // Flags (dev) — 06 §4.1 C asserts these absent in preview / prod
  NEXT_PUBLIC_DEV_MODE: {
    group: "Flags (dev)",
    scope: "public",
    kind: "boolean",
    purpose:
      "dev-mode auth bypass; honoured only when NODE_ENV !== production (01 §4d)",
    dev: "○",
    preview: "—",
    prod: "—",
    devOnly: true,
  },
  NEXT_PUBLIC_SKIP_INTRO_WAIT: {
    group: "Flags (dev)",
    scope: "public",
    kind: "boolean",
    purpose: "dev diagnostic (11.39)",
    dev: "○",
    preview: "—",
    prod: "—",
    devOnly: true,
  },
  NEXT_PUBLIC_FUNNEL_LOG: {
    group: "Flags (dev)",
    scope: "public",
    kind: "boolean",
    purpose: "dev diagnostic (11.39)",
    dev: "○",
    preview: "—",
    prod: "—",
    devOnly: true,
  },
  // Flags (Katie) — carried as Sydney ships them (07.08); values set by SPECS/05-katie-and-app/
  NEXT_PUBLIC_KATIE_TYPEWRITER_ENABLED: {
    group: "Flags (Katie)",
    scope: "public",
    kind: "boolean",
    purpose: "Katie sub-flag, client (07.08)",
    dev: "○",
    preview: "○",
    prod: "○",
  },
  // Monitoring (06 §7; ADR-106)
  NEXT_PUBLIC_SENTRY_DSN: {
    group: "Monitoring",
    scope: "public",
    kind: "url",
    purpose: "Sentry DSN, client (ADR-106)",
    dev: "—",
    preview: "●",
    prod: "●",
  },
} as const satisfies Readonly<Record<string, EnvEntry>>;
