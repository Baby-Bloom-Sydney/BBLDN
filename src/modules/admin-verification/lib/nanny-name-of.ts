// The name beside a row (04 §7.1 `{nanny}`): `user_profiles` keyed on the user id, at SESSION scope — an admin
// reads every profile under 07 §5.2, so RLS is the second gate and no service-role use is named. The
// `nanny_public` view cannot answer this (it excludes exactly the nannies the queue is about — below the pool).
// A profile that cannot be read shows as the id's short form, never as an error on the list.
//
// ★ ADR-169 — this read is keyed on the SESSION id and stays that way, because its other caller
// (`admin/call-queue`'s `aboutNanny`) genuinely holds one: 03 §3.2's `nanny-commission` booking carries her
// `auth.users` id. The verification queue holds the PARTY row's id instead and reaches the same answer through
// `nannyNameOfParty`, which crosses the seam once and delegates here.
import { auth } from "@/modules/auth";
import type { UserId } from "@/modules/shared-types";

const SHORT = 8;

export async function nannyNameOf(userId: UserId): Promise<string> {
  const read = await auth.data.run<{ readonly name: string | null }>({
    name: "admin-verification.nannyName",
    exec: async (q) => {
      const row = (await q
        .from("user_profiles")
        .eq("user_id", userId as string)
        .single()) as {
        readonly first_name: string | null;
        readonly last_name: string | null;
      } | null;
      if (row === null) return { name: null };
      const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
      return { name: name === "" ? null : name };
    },
  });
  return read.ok && read.value.name !== null
    ? read.value.name
    : `Nanny ${(userId as string).slice(0, SHORT)}`;
}
