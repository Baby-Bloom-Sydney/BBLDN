// ★ ADR-169 — the name beside a **verification queue** row.
//
// The queue carries the party row's id (`nannies.id`, straight from `vetting_submissions.nanny_id`), and
// `user_profiles` is keyed on `auth.users.id`. They are different values: handing the party id to a
// `user_id = $1` lookup matches nothing, and `nannyNameOf`'s short-form fallback then fires on EVERY row — the
// `Nanny 5eed0200` REVIEW-4 C-3 measured, which reads as a design choice rather than as a broken lookup.
//
// So the seam is crossed once, here, named, and the existing session-keyed read does the rest. It is a separate
// file rather than a branch inside `nannyNameOf` because the other caller (`admin/call-queue`'s `aboutNanny`)
// genuinely holds a session id, and a function that accepts either is the thing this ADR exists to remove.
import { auth } from "@/modules/auth";
import type { NannyId } from "@/modules/shared-types";
import { nannyNameOf } from "./nanny-name-of";

const SHORT = 8;

export async function nannyNameOfParty(nannyId: NannyId): Promise<string> {
  const read = await auth.data.run<{ readonly userId: string | null }>({
    name: "admin-verification.nannyUserId",
    exec: async (q) => {
      const row = (await q
        .from("nannies")
        .eq("id", nannyId as string)
        .single()) as { readonly user_id: string } | null;
      return { userId: row === null ? null : row.user_id };
    },
  });
  // A party row with no user is not a state `0005`'s NOT NULL allows; an unreadable one is, so the fallback is
  // the same short form the list already used rather than an error on a row the admin is trying to work.
  return read.ok && read.value.userId !== null
    ? nannyNameOf(read.value.userId as never)
    : `Nanny ${(nannyId as string).slice(0, SHORT)}`;
}
