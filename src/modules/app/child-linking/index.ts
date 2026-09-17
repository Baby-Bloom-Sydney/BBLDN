// app/child-linking connector (01 §2.5). Reached from outside through `@/modules/app`, never deep — the parent's
// connector re-exports what the outside may use.
export type * from "./types";
export { childLinking } from "./lib/default-child-linking";
export { configureChildLinking } from "./lib/configure-child-linking";
export { createChildLinking } from "./lib/create-child-linking";
export { dbChildLinkingStore } from "./lib/db-child-linking-store";
export { memoryChildLinkingStore } from "./lib/memory-child-linking-store";
export { normaliseInviteToken } from "./lib/normalise-invite-token";
export { mintInviteToken } from "./lib/mint-invite-token";
export { inviteAuthorisation } from "./lib/invite-authorisation";
