// The in-memory `AuthDriver` behind `stub-auth` (03 §11 row 9): sessions, password writes, role writes and a test
// schema, all in a closure. It is the **driver** that swaps, not the contract behaviour: the gate, the `Result`
// mapping and the password policy stay the module's own, so a stub can never quietly behave differently from the
// real thing (05 §3 rule 2 — a behaviour the stub cannot honour is a connector defect, not a stub exception).
import type {
  KeyedRead,
  Query,
  QueryHandle,
  ReadableName,
  RowOf,
} from "@/modules/shared-types";
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
import { isViewName } from "./is-view-name";

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

  // A real test schema: a write through the port is readable back through it, or a test could "succeed" against a
  // stub that records nothing (05 §3 rule 2 — a behaviour the stub cannot honour is a connector defect).
  const tables = new Map<
    string,
    ReadonlyArray<Readonly<Record<string, unknown>>>
  >(
    Object.entries(options.tables ?? {}).map(([name, rows]) => [
      name,
      rows as ReadonlyArray<Readonly<Record<string, unknown>>>,
    ]),
  );

  const append = (
    table: string,
    row: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> => {
    tables.set(table, [...(tables.get(table) ?? []), row]);
    return row;
  };

  // The stub's rows are whatever a test put in the map, so they become the generated row type at
  // the same single seam the real driver uses (`supabase-query.ts`) and for the same reason: a
  // per-table validator here would be `database.types.ts` written twice. Table and column **names**
  // are still checked at compile time - `N` is constrained to `ReadableName<AppDatabase>`, which is why
  // the S5 swap found a fixture in `auth.binding` that was writing a `user_roles` row with no
  // `user_id`.
  const asRow = <N extends ReadableName<AppDatabase>>(
    row: Readonly<Record<string, unknown>>,
  ): RowOf<AppDatabase, N> => row as RowOf<AppDatabase, N>;

  // ADR-131 (1): the keyed read the real driver answers with `.eq(...)` / `.maybeSingle()`, honoured here with
  // the same two rules — `select()` is every matching row, `single()` is the one row or `null`, and two matches
  // throw (a key that is not a key is a broken invariant, and a stub that picked one would let a test pass on it).
  const keyed = <N extends ReadableName<AppDatabase>>(
    name: N,
    column: string,
    value: unknown,
  ): KeyedRead<RowOf<AppDatabase, N>> => {
    const matching = () =>
      (tables.get(name) ?? []).filter((row) => row[column] === value);
    return {
      select: async () => matching().map(asRow<N>),
      single: async () => {
        const rows = matching();
        if (rows.length > 1)
          throw new Error(
            `keyed read on ${name}.${column} matched ${String(rows.length)} rows`,
          );
        return rows.length === 0 ? null : asRow<N>(rows[0]);
      },
    };
  };

  // ADR-129 / ADR-131 (1): a view's handle carries the reads and no write here either, so the stub cannot honour
  // a write the real driver refuses (05 §3 rule 2). The `as` is the same seam as `asRow` — `QueryHandle` is
  // conditional over the name.
  const from = <N extends ReadableName<AppDatabase>>(
    name: N,
  ): QueryHandle<AppDatabase, N> => {
    const select = async () => (tables.get(name) ?? []).map(asRow<N>);
    const eq = (column: string, value: unknown) => keyed(name, column, value);
    if (isViewName(name))
      return { select, eq } as unknown as QueryHandle<AppDatabase, N>;
    return {
      select,
      eq,
      insert: async (row: Readonly<Record<string, unknown>>) =>
        asRow<N>(append(name, row)),
      update: async (_id: string, patch: Readonly<Record<string, unknown>>) =>
        asRow<N>(append(name, patch)),
    } as unknown as QueryHandle<AppDatabase, N>;
  };

  const query = (): Query<AppDatabase> => ({
    from,
    rpc: async () => undefined,
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
    // No "fall back to whoever is signed in": the real driver throws on a code it cannot exchange, and a stub that
    // succeeds where production fails is a connector defect, not a stub convenience (05 §3 rule 2).
    exchangeCodeForSession: async (code: string) => {
      const user = find(code);
      if (user === null) throw new Error("no account for that code");
      return enter(user);
    },
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
