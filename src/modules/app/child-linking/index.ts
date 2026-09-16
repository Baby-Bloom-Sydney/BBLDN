// app/child-linking connector (01 §2.5). Reached from outside through `@/modules/app`, never deep — the parent's
// connector re-exports what the outside may use.
export type * from "./types";
export { childLinking } from "./lib/default-child-linking";
export { configureChildLinking } from "./lib/configure-child-linking";
