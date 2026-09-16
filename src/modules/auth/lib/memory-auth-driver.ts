// The in-memory `AuthDriver` behind `stub-auth` (03 §11 row 9): sessions, password writes, role writes and a test
// schema, all in a closure. It is the **driver** that swaps, not the contract behaviour: the gate, the `Result`
// mapping and the password policy stay the module's own, so a stub can never quietly behave differently from the
// real thing (05 §3 rule 2 — a behaviour the stub cannot honour is a connector defect, not a stub exception).
import type { Query } from "@/modules/shared-types";
import type {
  AppDatabase,
  AuthDriver,
  DriverUser,
  Role,
  SignInInput,
  SignUpInput,
  StorageRef,
  StubAuthOptions,
  StubUser,
} from "../types";

const STUB_EXPIRY_EPOCH_SECONDS = 1_800_000_000;

const toDriverUser = (user: StubUser): DriverUser => ({
  id: user.id,
  email: user.email,
  hasPassword: user.password !== undefined,
  aal: user.mfaVerified === true ? "aal2" : "aal1",
  expiresAtEpochSeconds: STUB_EXPIRY_EPOCH_SECONDS,
});

export function memoryAuthDriver(
  options: StubAuthOptions = {},
): AuthDriver<AppDatabase> {
  const state = {
    users: [...(options.users ?? [])] as ReadonlyArray<StubUser>,
    signedInUserId: options.signedInUserId ?? (null as string | null),
  };

  const find = (id: string | null): StubUser | null =>
    id === null ? null : (state.users.find((u) => u.id === id) ?? null);

  const upsert = (next: StubUser): void => {
    state.users = state.users.some((u) => u.id === next.id)
      ? state.users.map((u) => (u.id === next.id ? next : u))
      : [...state.users, next];
  };

  const enter = (user: StubUser): DriverUser => {
    state.signedInUserId = user.id;
    return toDriverUser(user);
  };

  const signedIn = (): StubUser => {
    const user = find(state.signedInUserId);
    if (user === null) throw new Error("no in-memory session");
    return user;
  };

  const query = (): Query<AppDatabase> => ({
    from: (table) => ({
      select: async () => (options.tables?.[table] ?? []) as never,
      insert: async (row) => row as never,
      update: async (_id, patch) => patch as never,
    }),
    rpc: async () => undefined as never,
  });

  return Object.freeze({
    currentUser: async () => {
      const user = find(state.signedInUserId);
      return user === null ? null : toDriverUser(user);
    },
    refresh: async () => {
      const user = find(state.signedInUserId);
      return user === null ? null : toDriverUser(user);
    },
    roleOf: async (userId: string) => find(userId)?.role ?? null,
    signInWithPassword: async (input: SignInInput) => {
      const user = state.users.find(
        (u) => u.email === input.email && u.password === input.password,
      );
      if (user === undefined) throw new Error("no such account");
      return enter(user);
    },
    signUpWithPassword: async (input: SignUpInput) => {
      if (state.users.some((u) => u.email === input.email))
        throw new Error("that account already exists");
      const user: StubUser = {
        id: globalThis.crypto.randomUUID(),
        email: input.email,
        password: input.password,
        role: input.role,
      };
      upsert(user);
      return enter(user);
    },
    signOut: async () => {
      state.signedInUserId = null;
    },
    updatePassword: async (newPassword: string) => {
      upsert({ ...signedIn(), password: newPassword });
    },
    exchangeCodeForSession: async (code: string) =>
      enter(find(code) ?? signedIn()),
    writeRole: async (userId: string, role: Role) => {
      const user = find(userId);
      if (user === null) throw new Error("no such account");
      upsert({ ...user, role });
    },
    query,
    createSignedUrl: async (ref: StorageRef, ttlSeconds: number) =>
      `https://stub.storage.test/${ref.bucket}/${ref.path}?ttl=${ttlSeconds}`,
  });
}
