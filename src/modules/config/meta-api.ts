// 01 §3.1 — the **server** half of the Meta configuration: the Conversions API endpoint for the London dataset
// (03 §9.5; ADR-055). Exported from `config/server` only, because it carries the access token.
//
// **Nothing here is hardcoded and nothing here is a prerequisite.** `META_DATASET_ID` and
// `META_CAPI_ACCESS_TOKEN` are `—` in dev and preview and `●` in prod (`lib/env-schema.ts`), so both are
// `string | undefined` until BAI provides them; `configured` says which state we are in, and `wire-events.ts`
// binds the `meta` sink only when it is `true`. An unconfigured dataset therefore sends nothing at all — it
// does not send to a guessed id, and it does not silently succeed (`ecc-lite` rule 5).
//
// The dataset id is never written into a component, a test or this comment. `08 §8 item 3` is explicit that the
// London dataset is **not** Sydney's, and a placeholder id in the tree is exactly how one becomes the other.
import { env } from "./env";

/** Graph API host and version — the vendor's endpoint, pinned so an upgrade is a visible edit, not a drift. */
const GRAPH_ORIGIN = "https://graph.facebook.com";
const GRAPH_API_VERSION = "v21.0";

const datasetId = env.server.META_DATASET_ID;
const accessToken = env.server.META_CAPI_ACCESS_TOKEN;

export const META_API = Object.freeze({
  datasetId,
  accessToken,
  /** Both, or neither. One without the other is an unusable endpoint, so it reads as unconfigured. */
  configured:
    typeof datasetId === "string" &&
    datasetId !== "" &&
    typeof accessToken === "string" &&
    accessToken !== "",
  endpoint:
    datasetId === undefined
      ? undefined
      : `${GRAPH_ORIGIN}/${GRAPH_API_VERSION}/${datasetId}/events`,
});
