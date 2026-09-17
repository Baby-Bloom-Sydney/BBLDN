// The routes this module's one action moves a parent between (04 §2.2). Kept here rather than inlined so the
// copy test and the action read the same strings, and so a route rename is one edit.
export const CONNECTIONS_PATHS = Object.freeze({
  browse: "/parent/browse",
  call: "/parent/call",
  login: "/login?next=%2Fparent%2Fbrowse",
});
