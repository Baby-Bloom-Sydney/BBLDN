// auth connector (01 §2.4; ADR-069) — the service module every module may import for the session read, the role
// gate and the **data-access port**: the only road to Postgres / Storage. It never exports a Supabase client or any
// driver type (01 §6.3 amended; 03 §1.4) and never imports a business module. The real inside is installed once at
// boot through `configureAuth`; until then every method fails closed (`INTERNAL { reason: 'auth-not-configured' }`),
// so a stub can never be mistaken for a configured system.
export type * from "./types";

// The connector (03 §1.4) — module-level bindings over the registry.
export { auth } from "./lib/default-auth";
export { configureAuth } from "./lib/configure-auth";
export { createAuth } from "./lib/create-auth";

// Drivers: the real one (`@supabase/ssr`, loaded lazily so middleware's edge bundle stays clean) and the stub.
export { supabaseAuthDriver } from "./lib/supabase-auth-driver";
export { stubAuth } from "./auth.stub";

// Pure role helpers (03 §1.4 "is* helpers are pure") — usable without a session read.
export { isParentRole } from "./lib/is-parent-role";
export { isNannyRole } from "./lib/is-nanny-role";
export { isAdminRole } from "./lib/is-admin-role";

// The gate's route knowledge (01 §4d) — one table, read by `src/middleware.ts` and by any redirect that has to
// send a person to "their own dashboard".
export { ROUTE_MAP } from "./lib/route-map";
export { roleDashboardPath } from "./lib/role-dashboard-path";
export { requiredRoleForPath } from "./lib/required-role-for-path";
export { isAuthGroupPath } from "./lib/is-auth-group-path";
export { loginRedirectUrl } from "./lib/login-redirect-url";
