// Prefix matching on a path-segment boundary: `/parent` claims `/parent` and `/parent/request`, never
// `/parental-leave`. One helper so the gate and the `(auth)` check cannot drift apart.
export function startsWithSegment(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
