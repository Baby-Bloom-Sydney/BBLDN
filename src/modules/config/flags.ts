// 01 §3.4 — the day-one flags, typed, read-only, read from env through env.ts. A flag's code default is the safe
// value (off) unless 01 §3.4 lists it **on**; the env value (the literal "true") wins when the name is present.
// A flag is read through `FLAGS.x`, never through `env` directly. Server-only; client bundles use PUBLIC_FLAGS.
import { env } from "./env";
import type { FlagName } from "./types";

const { server, public: pub } = env;
const isProduction = pub.NODE_ENV === "production";

export const FLAGS: Readonly<Record<FlagName, boolean>> = Object.freeze({
  KATIE: server.KATIE_ENABLED ?? true, // on — the app is the product (ADR-019)
  INVITE_LINKS: server.INVITE_LINKS_ENABLED ?? true, // on — stage table row 8 (ADR-031)
  NEW_TRIALS: server.NEW_TRIALS_ENABLED ?? true, // on (ADR-025 / 059)
  PAYMENTS: server.PAYMENTS_ENABLED ?? true, // on; kill switch only (06.11)
  BONUS_PROGRAM: server.BONUS_PROGRAM_ENABLED ?? false, // off (ADR-022 / 053 / 060)
  PROACTIVE: server.PROACTIVE_ENABLED ?? false, // 01 §10 O-5 — safe value until decided
  DEV_MODE: !isProduction && (pub.NEXT_PUBLIC_DEV_MODE ?? false), // honoured only outside production (01 §4d)
  EMAIL_DEV_DRY_RUN: server.EMAIL_DEV_DRY_RUN ?? false, // dev only (08.03)
  KATIE_STREAM_DIAGNOSTICS: server.KATIE_STREAM_DIAGNOSTICS ?? false,
  KATIE_PRELOAD_PASSTHROUGH: server.KATIE_PRELOAD_PASSTHROUGH_ENABLED ?? false,
  KATIE_PARALLEL_TOOLS: server.KATIE_PARALLEL_TOOLS_ENABLED ?? false,
  KATIE_IMAGE_MARKER: server.KATIE_IMAGE_MARKER_ENABLED ?? false,
  KATIE_ALWAYS_ON_CONTEXT: server.KATIE_ALWAYS_ON_CONTEXT_ENABLED ?? false,
  KATIE_TYPEWRITER: pub.NEXT_PUBLIC_KATIE_TYPEWRITER_ENABLED ?? false,
  SKIP_INTRO_WAIT: pub.NEXT_PUBLIC_SKIP_INTRO_WAIT ?? false, // dev diagnostic
  FUNNEL_LOG: pub.NEXT_PUBLIC_FUNNEL_LOG ?? false, // dev diagnostic
});
