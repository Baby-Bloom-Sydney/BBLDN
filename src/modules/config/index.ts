// config connector (01 §2.5, §3.1) — the client-safe surface: everything that reads no server env. Server code that
// needs `env`, `FLAGS`, `SENDERS`, `AREAS_SOURCE` or `KATIE` imports `@/modules/config/server` (see README).
export type * from "./types";
export { BRAND } from "./brand";
export { LOCALE } from "./locale";
export { DOMAIN } from "./domain";
export { URLS } from "./urls";
export { PRICES } from "./prices";
export { OFFER } from "./offer";
export { SCHEDULING } from "./scheduling";
export { MATCHING } from "./matching";
export { CONNECTIONS } from "./connections";
export { VETTING } from "./vetting";
export { META_EVENTS } from "./meta-events";
export { TEST_USER_DOMAIN } from "./testUserDomain";
export { CRONS } from "./crons";
export { SECURITY } from "./security";
export { UPLOADS } from "./uploads";
export { APP } from "./app";
export { LAUNCH } from "./launch";
export { publicEnv } from "./public-env";
export { PUBLIC_FLAGS } from "./public-flags";
