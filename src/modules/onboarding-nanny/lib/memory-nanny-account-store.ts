// The test double behind the account port (05 §3 rule 2). It keys rows by the **session** — `auth` says who is
// calling, exactly as `auth.uid()` does inside `0021`'s definers — so a test that signs in as one nanny cannot
// read or lift another's row, and a visitor gets the same refusal the database gives. Completeness is the
// `03.18` rule, computed here as `update_nanny_profile()` computes it.
import { auth } from "@/modules/auth";
import { err, newId, ok } from "@/modules/platform";
import type { Email, NannyId, UserId } from "@/modules/shared-types";
import type {
  MemoryNannyAccountRow,
  NannyAccountStore,
  NannyProfile,
  NannyStoreResult,
} from "../types";
import { isNannyProfileComplete } from "./is-nanny-profile-complete";

const NO_SESSION = err("UNAUTHENTICATED", "Sign in to continue.", {
  reason: "no-nanny-row" as const,
});

const toProfile = (row: MemoryNannyAccountRow): NannyProfile =>
  Object.freeze({
    userId: row.userId,
    nannyId: row.nannyId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    ...(row.mobile === undefined ? {} : { mobile: row.mobile }),
    ...(row.district === undefined ? {} : { district: row.district }),
    ...(row.area === undefined ? {} : { area: row.area }),
    ...(row.dateOfBirth === undefined ? {} : { dateOfBirth: row.dateOfBirth }),
    ...(row.profile ?? {}),
    isIsolated: row.isolated,
    verificationLevel: row.verificationLevel,
    profileVisible: row.profileVisible,
  });

export function memoryNannyAccountStore(
  seed: { readonly emails?: Readonly<Record<string, Email>> } = {},
): NannyAccountStore & {
  readonly rows: () => ReadonlyArray<MemoryNannyAccountRow>;
} {
  const state: { rows: ReadonlyArray<MemoryNannyAccountRow> } = { rows: [] };
  const replace = (next: MemoryNannyAccountRow): void => {
    state.rows = state.rows.some((row) => row.userId === next.userId)
      ? state.rows.map((row) => (row.userId === next.userId ? next : row))
      : [...state.rows, next];
  };
  const session = async (): Promise<NannyStoreResult<UserId>> => {
    const current = await auth.getCurrentUserId();
    if (!current.ok) return current as NannyStoreResult<never>;
    return current.value === null ? NO_SESSION : ok(current.value);
  };
  const own = async (): Promise<NannyStoreResult<MemoryNannyAccountRow>> => {
    const user = await session();
    if (!user.ok) return user;
    const row = state.rows.find((entry) => entry.userId === user.value);
    return row === undefined
      ? err("INTERNAL", "We couldn't find your account.", { reason: "no-nanny-row" as const })
      : ok(row);
  };

  return Object.freeze({
    create: async (input) => {
      const user = await session();
      if (!user.ok) return user;
      const existing = state.rows.find((row) => row.userId === user.value);
      if (existing !== undefined)
        return ok({ nannyId: existing.nannyId, leadConverted: false });
      // `create_nanny_account()` reads the address from `auth.users`; the double is told it (a `Session`
      // carries no email — 03 §1.4), and falls back to a marked placeholder no real address can collide with.
      const email = seed.emails?.[user.value] ?? (`${user.value}@session.invalid` as Email);
      replace(
        Object.freeze({
          ...input,
          userId: user.value,
          nannyId: newId<NannyId>(),
          email,
          profileVisible: false,
          verificationLevel: "L0_SIGNED_UP",
        }),
      );
      return ok({
        nannyId: state.rows.at(-1)?.nannyId as NannyId,
        leadConverted: input.leadId !== undefined,
      });
    },
    liftIsolation: async () => {
      const row = await own();
      if (!row.ok) return row;
      if (!row.value.isolated) return ok(false);
      replace(Object.freeze({ ...row.value, isolated: false }));
      return ok(true);
    },
    updateProfile: async ({ profile, contact }) => {
      const row = await own();
      if (!row.ok) return row;
      const next: MemoryNannyAccountRow = Object.freeze({
        ...row.value,
        ...(contact?.mobile === undefined ? {} : { mobile: contact.mobile }),
        ...(contact?.district === undefined ? {} : { district: contact.district }),
        ...(contact?.area === undefined ? {} : { area: contact.area }),
        ...(contact?.dateOfBirth === undefined ? {} : { dateOfBirth: contact.dateOfBirth }),
        profile: { ...(row.value.profile ?? {}), ...(profile ?? {}) },
      });
      const complete = isNannyProfileComplete(toProfile(next));
      replace(Object.freeze({ ...next, profileVisible: complete }));
      return ok({ complete });
    },
    get: async () => {
      const user = await session();
      if (!user.ok) return user;
      const row = state.rows.find((entry) => entry.userId === user.value);
      return ok(row === undefined ? null : toProfile(row));
    },
    rows: () => state.rows,
  });
}
