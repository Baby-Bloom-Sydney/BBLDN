// The ONE `process.env` reader for server code (01 §1.3 rule 1, §3.3; 07 §7 item 1). Parsed once at module load;
// a missing or malformed name fails the cold start with names only (`ALERT_ENV_INVALID`). Server-only: a client
// bundle cannot import a secret by accident — client code reads `publicEnv` (public-env.ts) instead.
import "server-only";
import { parseEnv } from "./lib/parse-env";

export const env = parseEnv(process.env);
