// The one place `UserId` becomes `AdminId` (typescript-reviewer, FIX-1 inline review, HIGH).
//
// 02 §4.1: an admin **is** a user — one `auth.users` row whose `user_roles.role` is `admin`. `shared-types/ids.ts`
// brands the two separately so an ordinary user id can never be passed where an admin id is meant, which is the
// right default and exactly why the compiler refuses `userId as AdminId` outright (`TS2352`, the brands do not
// overlap). Crossing that brand is therefore a real operation, not a formality, and it happens here **once** —
// named, so it is greppable and reviewable, rather than spelled as an inline double cast at each call site where
// the justification would have to be re-argued from a comment.
//
// This is not a validation step: the caller has already proved the session is an MFA-verified admin
// (`gated-admin-actor.ts`). It only re-labels an id the gate already trusts.
import type { AdminId, UserId } from "@/modules/shared-types";

export const adminIdFromUserId = (id: UserId): AdminId =>
  id as string as AdminId;
