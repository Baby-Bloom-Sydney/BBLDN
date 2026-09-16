// 01 §4d — is this one of the `(auth)` group's paths (signed-out only)?
import { ROUTE_MAP } from "./route-map";
import { startsWithSegment } from "./starts-with-segment";

export function isAuthGroupPath(pathname: string): boolean {
  return ROUTE_MAP.authGroupPaths.some((path) =>
    startsWithSegment(pathname, path),
  );
}
