// 01 §4d — "that user's own dashboard" (AC-A-28), the one place the mapping is read.
import type { Role } from "../types";
import { ROUTE_MAP } from "./route-map";

export function roleDashboardPath(role: Role): string {
  return ROUTE_MAP.dashboards[role];
}
