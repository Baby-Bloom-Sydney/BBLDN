// 01 §3.4 — the client mirrors of the flags (the `NEXT_PUBLIC_` names), typed and read-only, for client bundles.
// Same defaults as FLAGS; server code reads FLAGS.
import { publicEnv } from "./public-env";
import type { PublicFlagName } from "./types";

const isProduction = publicEnv.NODE_ENV === "production";

export const PUBLIC_FLAGS: Readonly<Record<PublicFlagName, boolean>> =
  Object.freeze({
    KATIE: publicEnv.NEXT_PUBLIC_KATIE_ENABLED ?? true,
    BONUS_PROGRAM: publicEnv.NEXT_PUBLIC_BONUS_PROGRAM_ENABLED ?? false,
    DEV_MODE: !isProduction && (publicEnv.NEXT_PUBLIC_DEV_MODE ?? false),
    KATIE_TYPEWRITER: publicEnv.NEXT_PUBLIC_KATIE_TYPEWRITER_ENABLED ?? false,
    SKIP_INTRO_WAIT:
      !isProduction && (publicEnv.NEXT_PUBLIC_SKIP_INTRO_WAIT ?? false),
    FUNNEL_LOG: !isProduction && (publicEnv.NEXT_PUBLIC_FUNNEL_LOG ?? false),
  });
