// The one read of `nanny_public` (07 §5.2 — the only road from a visitor to a nanny; ADR-129 made it reachable
// through the port). Session scope: the view carries its own predicate and `anon` has SELECT on it, so no
// service-role use is named for this read. Photos are signed here, batched, with the browse TTL and never by a
// component (07 §5.3 rule 1); a photo that cannot be signed renders as no photo rather than failing the page.
//
// 03 §1.4's `Query` has no keyed read (P1-WIRE recorded the same gap), so the whole view is read and filtered in
// memory — fine at launch scale (the supply gate is a few dozen nannies), recorded in the README as the thing a
// keyed read would replace.
import type { Auth, NamedOperation } from "@/modules/auth";
import { SECURITY } from "@/modules/config";
import type { Result } from "@/modules/shared-types";
import type { PublicNanny } from "../types";
import { toPublicNanny } from "./to-public-nanny";
import type { NannyPublicRow } from "./to-public-nanny";

const BUCKET = "profile-pictures" as const;
/** `profile_picture_path` is `<role>/<user_id>/<object>` (0016); the view ships the object leaf only. */
const ROLE_SEGMENT = "nanny";

const readRows: NamedOperation<ReadonlyArray<NannyPublicRow>> = Object.freeze({
  name: "matching.loadPublicNannies",
  exec: (q) => q.from("nanny_public").select(),
});

async function signPhoto(
  auth: Auth,
  row: NannyPublicRow,
): Promise<string | null> {
  if (row.profile_picture_object === null || row.nanny_id === null) return null;
  const signed = await auth.data.signUrl(
    {
      bucket: BUCKET,
      path: `${ROLE_SEGMENT}/${row.nanny_id}/${row.profile_picture_object}`,
    },
    SECURITY.signedUrlTtlSeconds.browse,
  );
  return signed.ok ? signed.value : null;
}

export async function loadPublicNannies(
  auth: Auth,
): Promise<Result<ReadonlyArray<PublicNanny>>> {
  const rows = await auth.data.run(readRows);
  if (!rows.ok) return rows;
  const nannies = await Promise.all(
    rows.value.map(async (row) =>
      toPublicNanny(row, await signPhoto(auth, row)),
    ),
  );
  return {
    ok: true,
    value: Object.freeze(
      nannies.filter((nanny): nanny is PublicNanny => nanny !== null),
    ),
  };
}
