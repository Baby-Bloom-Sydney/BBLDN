// 01 §4d step 2 — "no session → redirect to login with `next=`". The attempted path is echoed back into a URL a
// browser will follow after signing in, so it must be a same-origin *path* and nothing else: an absolute URL, a
// protocol-relative `//host`, or a backslash-smuggled host would make this an open redirect.
import { ROUTE_MAP } from "./route-map";

const isSafeInternalPath = (value: string): boolean =>
  value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");

export function loginRedirectUrl(pathname: string, search = ""): string {
  const target = `${pathname}${search}`;
  if (!isSafeInternalPath(pathname)) return ROUTE_MAP.loginPath;
  return `${ROUTE_MAP.loginPath}?${ROUTE_MAP.nextParam}=${encodeURIComponent(target)}`;
}
