// 01 §4d step 2 — prefix → required role; `null` means the path is not role-gated.
import type { Role } from "../types";
import { ROUTE_MAP } from "./route-map";
import { startsWithSegment } from "./starts-with-segment";

export function requiredRoleForPath(pathname: string): Role | null {
  const row = ROUTE_MAP.protectedPrefixes.find((entry) =>
    startsWithSegment(pathname, entry.prefix),
  );
  return row?.role ?? null;
}
