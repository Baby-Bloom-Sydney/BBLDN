// 01 §3.1 — the **client-safe** half of the Meta configuration: what the browser needs to mount the pixel
// (ADR-055; 03 §9.5). The dataset id and the Conversions API token are server values and live in
// `meta-api.ts`, which this file deliberately does not import — a client bundle that could reach the token by
// following an import is a bundle that will one day ship it.
//
// **Every value here is config, never a literal** (L4). `pixelId` is `NEXT_PUBLIC_META_PIXEL_ID`, which is `—`
// in dev and preview and `●` only in prod (`lib/public-env-schema.ts`), so it is **absent until BAI provides
// it** and the type says so: `string | undefined`, and the pixel component renders nothing without it. That is
// the fail-closed reading (`ecc-lite` rule 5) — an unconfigured pixel loads no script rather than loading one
// pointed at nothing.
//
// The loader's **origin** is read from `SECURITY.csp.metaScriptOrigins` rather than written again here. Two
// reasons, and the second is the load-bearing one: (1) the origin is already a config value with an owner
// (07 §10.3), and (2) `consent-gate.repo.test.ts` scans the tree for that host name and allows it in exactly
// two files — the gated component and the CSP file that declares it. Naming it a third time would either fail
// that scan or force the scan to be widened, and widening the scan is how the rule stops protecting anybody.
import { SECURITY } from "./security";
import { publicEnv } from "./public-env";

/** The vendor's loader path under its origin. Not a brand value; it is the file Meta publishes the pixel at. */
const SCRIPT_PATH = "/en_US/fbevents.js";

export const META = Object.freeze({
  /** `undefined` until the London pixel exists (B-32). The pixel mounts nothing while it is. */
  pixelId: publicEnv.NEXT_PUBLIC_META_PIXEL_ID,
  scriptSrc: `${SECURITY.csp.metaScriptOrigins[0]}${SCRIPT_PATH}`,
  /** The one event the pixel fires on its own, with no server counterpart to deduplicate against (03 §9.5). */
  pageViewEvent: "PageView",
});
