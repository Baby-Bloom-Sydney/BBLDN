// The client-safe reader (01 §3.3): only `NEXT_PUBLIC_*` names and NODE_ENV, each as a literal property access so
// Next.js inlines it at build time. No other `process.env` read exists outside env.ts (config.env suite asserts it).
import { parsePublicEnv } from "./lib/parse-public-env";

export const publicEnv = parsePublicEnv({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  NEXT_PUBLIC_KATIE_ENABLED: process.env.NEXT_PUBLIC_KATIE_ENABLED,
  NEXT_PUBLIC_BONUS_PROGRAM_ENABLED:
    process.env.NEXT_PUBLIC_BONUS_PROGRAM_ENABLED,
  NEXT_PUBLIC_DEV_MODE: process.env.NEXT_PUBLIC_DEV_MODE,
  NEXT_PUBLIC_SKIP_INTRO_WAIT: process.env.NEXT_PUBLIC_SKIP_INTRO_WAIT,
  NEXT_PUBLIC_FUNNEL_LOG: process.env.NEXT_PUBLIC_FUNNEL_LOG,
  NEXT_PUBLIC_KATIE_TYPEWRITER_ENABLED:
    process.env.NEXT_PUBLIC_KATIE_TYPEWRITER_ENABLED,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});
