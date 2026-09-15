// auth — the module's type surface (01 §2.5). Copied from `03-interface-contracts.md` §1.4 with the names that
// contract spells, plus the driver seam the inside is built on. Values live in index.ts. **Types only** — this file
// is client-safe (`index.ts` is `server-only`), so a `"use client"` page may `import type` from the connector.
import type { NextRequest, NextResponse } from "next/server";
import type { BucketKey } from "@/modules/config";
import type {
  Actor,
  CustomerRole,
  DatabaseShape,
  Email,
  EnumValue,
  Instant,
  ModuleName,
  Query,
  Result,
  UnitOfWork,
  Url,
  UserId,
} from "@/modules/shared-types";

// ── Session + roles (03 §1.4; 01 §4d) ──

/** `parent` · `nanny` · `admin` — "any admin login", no `super_admin` (ADR-030; 02 §3 `user_role`, §5 row 7). */
export type Role = EnumValue<"user_role">;

/** 03 §1.4 verbatim. `mfaVerified` = Supabase `aal2`, required for `admin` (07 §5.4 row 2). */
export type Session = {
  readonly userId: UserId;
  readonly role: Role;
  readonly mfaVerified: boolean;
  readonly expiresAt: Instant;
};

/**
 * What the middleware gets back from `refreshSession`: a `Session` plus the one extra signal the gate needs and
 * cannot get a second time (01 §4d step 3 — the edge runtime has no `next/headers`, so the gate reads the
 * password signal in the same round-trip that rotates the cookies). A `GateSession` **is** a `Session`, so the
 * 03 §1.4 return type is honoured and no caller that knows only `Session` changes.
 */
export type GateSession = Session & {
  readonly needsPasswordSetup: boolean;
};

/**
 * Self-signup produces a customer role only: no path a visitor can reach may write `admin`
 * (07 §5.4 row 3 — admin accounts are created by migration / service role; `grantRole` is the admin-actor road).
 */
export type SignUpInput = {
  readonly email: Email;
  readonly password: string;
  readonly role: CustomerRole;
  /** Where Supabase sends the confirmation link back to (`handleAuthCallback`, ADR-042). */
  readonly emailRedirectTo?: Url;
};

export type SignInInput = {
  readonly email: Email;
  readonly password: string;
};

// ── Errors (03 §1.4: `UNAUTHENTICATED` · `FORBIDDEN { reason }` · `INTERNAL`) ──

/** `role` = wrong role · `mfa` = admin without `aal2` (07 §5.4 row 2) · `scope` = a service-scope refusal. */
export type AuthFailureReason = "role" | "mfa" | "scope";

export type AuthErrorDetails = {
  readonly reason: AuthFailureReason;
};

// ── Data-access port (01 §6.3 amended; 03 §1.4) ──

/**
 * The generated `Database["public"]` shape (01 §6.2). `shared-types/database.types.ts` is written by S5 with
 * migration `0000`; until it exists this is the open `DatabaseShape`, and it is the **one** line that changes
 * when it lands — `Query` deliberately has no default so every call site names its shape.
 */
export type AppDatabase = DatabaseShape;

/** `session` = RLS as the caller; `service` = named jobs and definers only, logged (03 §1.4). */
export type DataScope = "session" | "service";

/** A module's own repo function over `auth`'s narrow `Query` surface — not a client (03 §1.4). */
export type NamedOperation<T, DB extends DatabaseShape = AppDatabase> = {
  readonly name: `${ModuleName}.${string}`;
  readonly exec: (q: Query<DB>) => Promise<T>;
};

export type RunOptions = {
  readonly uow?: UnitOfWork;
  readonly scope?: DataScope;
};

/** A storage object by bucket + path — never a URL, never a bucket path built outside its owning module (01 §6.3). */
export type StorageRef = {
  readonly bucket: BucketKey;
  readonly path: string;
};

export interface DataAccessPort<DB extends DatabaseShape = AppDatabase> {
  run<T>(op: NamedOperation<T, DB>, opts?: RunOptions): Promise<Result<T>>;
  /** The one signed-URL minter (07 §5.3 rule 1); TTLs come from `SECURITY.signedUrlTtlSeconds`. */
  signUrl(ref: StorageRef, ttlSeconds: number): Promise<Result<Url>>;
}

// ── The connector (03 §1.4) ──

export interface Auth<DB extends DatabaseShape = AppDatabase> {
  /** From the request; `null` for anonymous, never throws (03 §1.4). */
  getSession(): Promise<Result<Session | null>>;
  requireRole(
    role: Role | ReadonlyArray<Role>,
  ): Promise<Result<Session, AuthErrorDetails>>;
  getCurrentUserId(): Promise<Result<UserId | null>>;
  readonly data: DataAccessPort<DB>;
  /** Middleware only (01 §4d step 1): the one place session cookies are rotated. */
  refreshSession(
    req: NextRequest,
    res: NextResponse,
  ): Promise<Result<GateSession | null>>;
  /**
   * 01 §4d step 3 — a signed-in user with no password (ADR-042) is routed to set-password, never shown an error.
   * **Connector extension:** 03 §1.4 does not name this method; the gate rule it serves is stated in 01 §4d and
   * has no other expressible signal. Raised for ratification in the L-005 S4 entry (amend-first).
   */
  needsPasswordSetup(): Promise<Result<boolean>>;
  signUp(input: SignUpInput): Promise<Result<Session>>;
  signIn(input: SignInInput): Promise<Result<Session>>;
  signOut(): Promise<Result<void>>;
  setPassword(newPassword: string): Promise<Result<void>>;
  /** ADR-042 passwordless catch: the caller sends the email; this exchanges the code (03 §1.4). */
  handleAuthCallback(code: string): Promise<Result<Session>>;
  /** Admin actor only, logged (03 §1.4; 07 §5.4 row 3). */
  grantRole(userId: UserId, role: Role, actor: Actor): Promise<Result<void>>;
  isParent(s: Session): boolean;
  isNanny(s: Session): boolean;
  isAdmin(s: Session): boolean;
}

// ── The driver seam (the inside only; never re-exported to a business module) ──

/** What the identity provider knows about the caller, reduced to the fields the gate needs. */
export type DriverUser = {
  readonly id: string;
  readonly email: string | null;
  /** `false` ⇒ ADR-042's passwordless account — the gate routes it to set-password (01 §4d step 3). */
  readonly hasPassword: boolean;
  /** Supabase assurance level; `aal2` is `mfaVerified` (07 §5.4 row 2). */
  readonly aal: string | null;
  /** Session expiry as an epoch-second stamp, as the provider reports it. */
  readonly expiresAtEpochSeconds: number | null;
};

/**
 * The narrow surface `createAuth` is written against: one implementation over `@supabase/ssr`
 * (`supabaseAuthDriver`), one in memory (`stub-auth`). No `@supabase/*` type crosses this seam, so the module is
 * unit-testable with no network and the stub honours the connector trivially (05 §3 rules 1–2).
 */
export interface AuthDriver<DB extends DatabaseShape = AppDatabase> {
  /** Reads the caller's identity from the ambient request context; `null` when anonymous. Never throws. */
  currentUser(): Promise<DriverUser | null>;
  /** Rotates the session cookies onto `res` and returns the refreshed identity (middleware only). */
  refresh(req: NextRequest, res: NextResponse): Promise<DriverUser | null>;
  /** `user_roles.role` for a user (02 §4.1); `null` when no row exists. */
  roleOf(userId: string): Promise<Role | null>;
  signInWithPassword(input: SignInInput): Promise<DriverUser>;
  signUpWithPassword(input: SignUpInput): Promise<DriverUser>;
  signOut(): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  exchangeCodeForSession(code: string): Promise<DriverUser>;
  /** Writes the `user_roles` row from a server-side value (07 §10.1); service scope. */
  writeRole(userId: string, role: Role): Promise<void>;
  /** The narrow typed query surface for the given scope (03 §1.4). */
  query(scope: DataScope): Query<DB>;
  createSignedUrl(ref: StorageRef, ttlSeconds: number): Promise<string>;
}

/** What `createAuth` needs beyond the driver. */
export type AuthDeps<DB extends DatabaseShape = AppDatabase> = {
  readonly driver: AuthDriver<DB>;
};

// ── stub-auth (05 §3 rule 1: production code inside the module it stubs) ──

/** One in-memory account. No `password` ⇒ ADR-042's passwordless account. */
export type StubUser = {
  readonly id: string;
  readonly email: Email;
  readonly password?: string;
  /** Absent ⇒ authenticated with the provider but not a known actor — the gate treats it as no session. */
  readonly role?: Role;
  readonly mfaVerified?: boolean;
};

export type StubAuthOptions = {
  readonly users?: ReadonlyArray<StubUser>;
  readonly signedInUserId?: string;
  /** Rows a `NamedOperation` sees; the stub's "test schema" behind the same port (03 §11 row 9). */
  readonly tables?: Readonly<Record<string, ReadonlyArray<unknown>>>;
};
