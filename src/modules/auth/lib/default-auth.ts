// The module-level `auth` binding (03 §1.4). Unconfigured it resolves to the real Supabase-backed inside — the
// default is the *real* thing, not a stub, so nothing can succeed against a fake by accident. `configureAuth`
// replaces it (test wiring, `stub-auth`), and every method re-reads the registry so a later call wins.
import type { NextRequest, NextResponse } from "next/server";
import type { Actor, Email, UserId } from "@/modules/shared-types";
import type {
  AppDatabase,
  Auth,
  DataAccessPort,
  NamedOperation,
  PutObjectOptions,
  Role,
  RunOptions,
  Session,
  SignInInput,
  SignUpInput,
  StorageRef,
} from "../types";
import { AUTH_REGISTRY } from "./auth-registry";
import { createAuth } from "./create-auth";
import { isAdminRole } from "./is-admin-role";
import { isNannyRole } from "./is-nanny-role";
import { isParentRole } from "./is-parent-role";
import { supabaseAuthDriver } from "./supabase-auth-driver";

const resolve = (): Auth<AppDatabase> => {
  const configured = AUTH_REGISTRY.get();
  if (configured !== null) return configured;
  const built = createAuth({ driver: supabaseAuthDriver() });
  AUTH_REGISTRY.set(built);
  return built;
};

const data: DataAccessPort<AppDatabase> = Object.freeze({
  run: <T>(op: NamedOperation<T>, opts?: RunOptions) =>
    resolve().data.run(op, opts),
  signUrl: (ref: StorageRef, ttlSeconds: number) =>
    resolve().data.signUrl(ref, ttlSeconds),
  putObject: (ref: StorageRef, body: Uint8Array, opts: PutObjectOptions) =>
    resolve().data.putObject(ref, body, opts),
  removeObject: (ref: StorageRef) => resolve().data.removeObject(ref),
});

export const auth: Auth<AppDatabase> = Object.freeze({
  getSession: () => resolve().getSession(),
  requireRole: (role: Role | ReadonlyArray<Role>) =>
    resolve().requireRole(role),
  getCurrentUserId: () => resolve().getCurrentUserId(),
  data,
  refreshSession: (req: NextRequest, res: NextResponse) =>
    resolve().refreshSession(req, res),
  needsPasswordSetup: () => resolve().needsPasswordSetup(),
  requestPasswordReset: (email: Email) => resolve().requestPasswordReset(email),
  signUp: (input: SignUpInput) => resolve().signUp(input),
  signIn: (input: SignInInput) => resolve().signIn(input),
  signOut: () => resolve().signOut(),
  setPassword: (newPassword: string) => resolve().setPassword(newPassword),
  handleAuthCallback: (code: string) => resolve().handleAuthCallback(code),
  grantRole: (userId: UserId, role: Role, actor: Actor) =>
    resolve().grantRole(userId, role, actor),
  isParent: (s: Session) => isParentRole(s.role),
  isNanny: (s: Session) => isNannyRole(s.role),
  isAdmin: (s: Session) => isAdminRole(s.role),
});
