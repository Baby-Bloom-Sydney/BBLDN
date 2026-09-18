// Kickoff debt 2 — **the one read that puts a nanny's name on a parent surface** (04 §7.1 `{nanny}`).
//
// `nanny_public` and nothing else. 07 §5.2 makes the view "a parent's only road to a nanny" and 07 §5.1 rule 4
// keeps contact detail out of it, so a first name read here is a name and nothing more — no address, no mobile,
// no date of birth, and no row for a nanny who is isolated or below the pool (ADR-162's `nanny_visible()` is
// baked into the view). Session scope: the view carries its own predicate and `anon` already holds SELECT on it,
// so no service-role use joins 07 §5.1 rule 5's list.
//
// `null` is the honest answer when the view has no row for her — a family then reads the line without a name,
// exactly as it did before, rather than a raw id. The three call sites (rail rows 4-6, S-P-08's cards, the admin
// call drawer) all reach this through `connections`' injected port, because 01 §2.3 gives none of them an arrow
// here.
import type { Auth } from "@/modules/auth";
import type { NannyId, Result } from "@/modules/shared-types";

type NamedRow = { readonly first_name: string | null };

export async function publicNannyName(
  auth: Auth,
  nannyId: NannyId,
): Promise<Result<string | null>> {
  return auth.data.run<string | null>({
    name: "matching.publicNannyName",
    exec: async (q) => {
      const row = (await q
        .from("nanny_public")
        .eq("nanny_id", nannyId as string)
        .single()) as NamedRow | null;
      const name = row?.first_name ?? null;
      return name === null || name === "" ? null : name;
    },
  });
}
