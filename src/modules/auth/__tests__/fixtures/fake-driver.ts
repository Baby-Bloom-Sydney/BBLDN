// A hand-driven `AuthDriver` double (05 §4.3 fixtures): the seam `createAuth` is written against, with no network
// and no Supabase type. One export (L1) — the factory; its handle carries the knobs each spec needs.
import type { NextRequest, NextResponse } from "next/server";
import type {
  AppDatabase,
  AuthDriver,
  DataScope,
  DriverUser,
  Role,
  StorageRef,
} from "../../types";
import type { Query } from "@/modules/shared-types";

export type FakeDriverState = {
  user: DriverUser | null;
  role: Role | null;
  /** Set to make the next provider call throw, as a real SDK would. */
  throwOn: string | null;
  roles: Array<{ readonly userId: string; readonly role: Role }>;
  scopes: DataScope[];
  signedUrls: Array<{ readonly ref: StorageRef; readonly ttlSeconds: number }>;
  queryResult: unknown;
};

export type FakeDriver = {
  readonly driver: AuthDriver<AppDatabase>;
  readonly state: FakeDriverState;
};

export const aDriverUser = (over: Partial<DriverUser> = {}): DriverUser => ({
  id: "11111111-1111-4111-8111-111111111111",
  email: "someone@example.test",
  hasPassword: true,
  aal: "aal1",
  expiresAtEpochSeconds: 1_800_000_000,
  ...over,
});

export function fakeDriver(over: Partial<FakeDriverState> = {}): FakeDriver {
  const state: FakeDriverState = {
    user: null,
    role: null,
    throwOn: null,
    roles: [],
    scopes: [],
    signedUrls: [],
    queryResult: { ok: true },
    ...over,
  };

  const boom = (name: string): void => {
    if (state.throwOn === name) {
      state.throwOn = null;
      throw new Error(`provider exploded in ${name}`);
    }
  };

  const query = (scope: DataScope): Query<AppDatabase> => {
    state.scopes = [...state.scopes, scope];
    boom("query");
    return {
      from: () => {
        throw new Error("from() is not exercised by these specs");
      },
      rpc: async () => state.queryResult as never,
    };
  };

  const driver: AuthDriver<AppDatabase> = {
    currentUser: async () => {
      boom("currentUser");
      return state.user;
    },
    refresh: async (_req: NextRequest, _res: NextResponse) => {
      boom("refresh");
      return state.user;
    },
    roleOf: async () => {
      boom("roleOf");
      return state.role;
    },
    signInWithPassword: async () => {
      boom("signInWithPassword");
      return state.user ?? aDriverUser();
    },
    signUpWithPassword: async () => {
      boom("signUpWithPassword");
      return state.user ?? aDriverUser();
    },
    signOut: async () => {
      boom("signOut");
      state.user = null;
    },
    updatePassword: async () => {
      boom("updatePassword");
      if (state.user !== null)
        state.user = { ...state.user, hasPassword: true };
    },
    exchangeCodeForSession: async () => {
      boom("exchangeCodeForSession");
      return state.user ?? aDriverUser();
    },
    writeRole: async (userId: string, role: Role) => {
      boom("writeRole");
      state.roles = [...state.roles, { userId, role }];
      state.role = role;
    },
    query,
    createSignedUrl: async (ref: StorageRef, ttlSeconds: number) => {
      boom("createSignedUrl");
      state.signedUrls = [...state.signedUrls, { ref, ttlSeconds }];
      return `https://storage.test/${ref.bucket}/${ref.path}?ttl=${ttlSeconds}`;
    },
  };

  return { driver, state };
}
