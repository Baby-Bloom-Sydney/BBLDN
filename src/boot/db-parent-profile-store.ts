// The `ParentProfileStore` of `onboarding-parent` over `auth`'s data port — the `create_parent_profile` definer
// of `0017`. 02 §4.1: "exactly one `user_roles` + one `user_profiles` row per user, created in the signup action;
// **no triggers** (C-8)". Neither table has a client INSERT policy and 07 §5.4 row 3 forbids adding one, so the
// signup action had nothing to write through until this function existed — `1c` pinned that gap rather than
// inventing a default that answered `ok` with no row behind it.
//
// **Session scope, deliberately.** The function takes no user id: it mints the pair for `auth.uid()`. Running it
// under the service role would silently mean "no session", which the function refuses — and would also hand the
// signup path a service-role call it has no need of (07 §5.1 rule 5 keeps that list short).
//
// Two tables, one transaction (ADR-127), which is also why this is an RPC rather than two `insert`s through the
// port: a user with a role row and no profile row is a broken invariant, not a retry.
import type { DataAccessPort } from "@/modules/auth";
import type {
  ParentProfileErrorDetails,
  ParentProfileStore,
} from "@/modules/onboarding-parent";
import type { Result } from "@/modules/shared-types";

/** The port promises `AppErrorDetails`; the store promises `ParentProfileErrorDetails`, whose INTERNAL reason the
 *  action never surfaces (01 §4a). A driver failure arrives already reduced to a `Result` by the port. */
const asProfile = <T>(
  result: Result<T>,
): Result<T, ParentProfileErrorDetails> =>
  result as Result<T, ParentProfileErrorDetails>;

export function dbParentProfileStore(port: DataAccessPort): ParentProfileStore {
  return Object.freeze({
    create: async (input) =>
      asProfile(
        await port.run({
          name: "onboarding-parent.createProfile",
          exec: async (q) => {
            await q.rpc("create_parent_profile", {
              p_first_name: input.firstName,
              p_last_name: input.lastName,
              p_mobile: input.mobile,
            });
          },
        }),
      ),
  });
}
