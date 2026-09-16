// public-site connector (01 §2.3) — the public surface. It may import `matching`, `connections` and the
// service modules; it never imports `scheduling` (03 §3.6 R3), and it reaches K-1 through the `connections`
// stage-model connector rather than writing a stage itself.
//
// **Types only in this unit** — the pages, the browse Connect action and `/api/areas` are `04` + F-c work.
// See README "Gaps".
export type * from "./types";
