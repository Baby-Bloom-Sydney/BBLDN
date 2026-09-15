// `seededUsers` — the `int.auth-gate` fixture (05 §4.2 / §4.3): one account per gate state the middleware has to
// tell apart. In-memory only; `stub-auth` is the schema behind them.
import type { Email } from "@/modules/shared-types";
import type { StubUser } from "../../types";

const PASSWORD = "a-long-enough-password";

export const seededUsers: Readonly<Record<string, StubUser>> = Object.freeze({
  parent: Object.freeze({
    id: "11111111-1111-4111-8111-111111111111",
    email: "parent@example.test" as Email,
    password: PASSWORD,
    role: "parent",
  }),
  nanny: Object.freeze({
    id: "22222222-2222-4222-8222-222222222222",
    email: "nanny@example.test" as Email,
    password: PASSWORD,
    role: "nanny",
  }),
  admin: Object.freeze({
    id: "33333333-3333-4333-8333-333333333333",
    email: "admin@example.test" as Email,
    password: PASSWORD,
    role: "admin",
    mfaVerified: true,
  }),
  /** An admin session at `aal1` — 07 §5.4 row 2: it must not reach `/admin/*`. */
  adminNoMfa: Object.freeze({
    id: "44444444-4444-4444-8444-444444444444",
    email: "admin2@example.test" as Email,
    password: PASSWORD,
    role: "admin",
    mfaVerified: false,
  }),
  /** ADR-042: an account created without a password — routed to set-password, never shown an error. */
  passwordless: Object.freeze({
    id: "55555555-5555-4555-8555-555555555555",
    email: "invited@example.test" as Email,
    role: "parent",
  }),
});
