// 07 §5.3 rule 1 — the signed-URL lifetime is **per bucket**, not one global ceiling: browse and profile pages
// get 24 h with `Cache-Control: private`, app surfaces 1 h, and `verification-documents` — DBS, right-to-work and
// ID evidence — 1 h, which 07 §10.1's `auth` row names as a mandatory check. `auth` is "the one signed-URL
// minter" (03 §1.4) precisely so no caller has to remember that, so the bound is applied here by bucket.
//
// The three keys of `SECURITY.signedUrlTtlSeconds` (`app` · `browse` · `verification`) are categories, not bucket
// names; mapping them here is the join. **Suggested for `config`'s owner:** rename them to the `BucketKey` values
// so a config test can pin the two sets equal, as `config` already does for the other enums. Not done from this
// unit — `src/modules/config/**` is a shared file and outside S4's touch surface.
import { SECURITY } from "@/modules/config";
import type { BucketKey } from "@/modules/config";

export const SIGNED_URL_TTL_CEILING: Readonly<Record<BucketKey, number>> =
  Object.freeze({
    "profile-pictures": SECURITY.signedUrlTtlSeconds.browse,
    "verification-documents": SECURITY.signedUrlTtlSeconds.verification,
    "development-images": SECURITY.signedUrlTtlSeconds.app,
  });
