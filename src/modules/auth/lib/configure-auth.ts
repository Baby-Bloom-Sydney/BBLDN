// The boot / test hook: install the inside the module-level `auth` binding delegates to. Called once from the
// app's boot code, and by test wiring to bind `stub-auth` (05 §3 rule 3).
import type { AppDatabase, Auth } from "../types";
import { AUTH_REGISTRY } from "./auth-registry";

export function configureAuth(next: Auth<AppDatabase>): void {
  AUTH_REGISTRY.set(next);
}
