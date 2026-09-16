// auth connector (01 §2.4; ADR-069) — the service module every module may import for the session read, the role
// gate and the **data-access port**: the only road to Postgres / Storage. It never exports a Supabase client or any
// driver type (01 §6.3 amended; 03 §1.4) and never imports a business module.
//
// **The module-level `auth` binding defaults to the REAL Supabase-backed inside, not to a fail-closed stub.** That
// is the opposite of `platform`'s registries, and deliberately so: `platform`'s ports have no implementation until
// a database exists, whereas `auth`'s does — it needs only env, and `config` throws at import if that env is
// missing (01 §4d step 5). There is no `src/instrumentation.ts` in this repo yet (see the module README), so a
// fail-closed default would mean the app has no gate at all. `configureAuth` replaces the default — that is how
// test wiring and `stub-auth` are selected (05 §3 rule 3) — and every method re-reads the registry, so a later
// call wins.
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
export { gateDecision } from "./lib/gate-decision";

// S-X-09's set-password variant (ADR-042) — the one `(auth)` surface this unit owns. A route file imports the
// connector and renders; the action is passed to the client component as a prop so the client bundle never
// reaches the connector barrel (01 §2.5 "route files are thin").
export { setPasswordAction } from "./actions/set-password-action";
export { SetPasswordForm } from "./components/SetPasswordForm";
