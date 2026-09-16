// Boot hook: installs the inside the module-level `adminOnBehalf` binding delegates to.
import type { AdminOnBehalf } from "../types";
import { ADMIN_ON_BEHALF_REGISTRY } from "./admin-on-behalf-registry";

export function configureAdminOnBehalf(inside: AdminOnBehalf): void {
  ADMIN_ON_BEHALF_REGISTRY.set(inside);
}
