// 07 §5.5 layer 1 — the stub provider may not exist in a production-resolved environment (ADR-108: `VERCEL_ENV`,
// else `NODE_ENV = production` at runtime). It **throws** rather than returning a `Result`: a guard whose caller
// can ignore it is not a guard, and refusing the boot is the documented outcome (07 §5.5 item 2 / §7.1).
//
// This is layer 1 of three, each sufficient alone: the loader refuses here, `config`'s env schema refuses
// `PURCHASE_PROVIDER = stub-stripe` in production (`refine-env.ts`), and the stub route re-checks the admin role
// and the shared secret on every call.
import type { Environment } from "@/modules/config";

const MESSAGE =
  "stub-stripe is not available in a production environment (07 §5.5)";

export function assertStubAllowed(environment: Environment): void {
  if (environment === "production") throw new Error(MESSAGE);
}
