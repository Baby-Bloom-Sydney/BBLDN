// Whether a pathname is one of the screens whose chrome this module renders (the `(public)` group of 01 §4d,
// read from the register). Layout primitives decide from the pathname, never from a client auth state
// (01 §4d "defence in depth").
import { PUBLIC_ROUTES } from "./public-routes";

export function isPublicSitePath(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) =>
      route.group === "public" &&
      (pathname === route.path ||
        (route.prefix !== undefined && pathname.startsWith(route.prefix))),
  );
}
