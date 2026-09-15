// config connector, server half (01 §3.3 `serverEnv` guarded with `server-only`): the universal surface plus every
// value read from server env. Import as `@/modules/config/server` from server files only.
import "server-only";
export * from "../index";
export { env } from "../env";
export { FLAGS } from "../flags";
export { SENDERS } from "../senders";
export { AREAS_SOURCE } from "../areas-source";
export { KATIE } from "../katie";
