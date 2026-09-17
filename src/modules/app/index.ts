// app connector (01 §2.5; 00-glossary §3) — the paid product: `katie` · `child-development` · `child-linking`
// (ADR-019). The three are sub-modules with their own `index.ts`; **this** connector is what the outside imports
// (`@/modules/app`), never a deep path. May import `comms` (S) · `auth` (S) · `platform` (S), plus
// `platform/consent` for the child-linking consents (01 §2.3; 02 R-4).
export type * from "./types";

// Sub-module vocabularies (01 §2.5 — "the parent's connector re-exports what the outside may use").
export type * from "./katie";
export type * from "./child-development";
export type * from "./child-linking";

// `child-linking`'s runtime surface (ADR-083 / 084; `1i`): the reads that bound a family's access, the writes
// that create a child and move an invite, and the screens of 04 §6.1 / §6.2.
export {
  childLinking,
  configureChildLinking,
  createChildLinking,
  dbChildLinkingStore,
  memoryChildLinkingStore,
  normaliseInviteToken,
  mintInviteToken,
  inviteAuthorisation,
  InviteLandingPage,
  ChildrenCard,
  AppGateNotice,
  loadInviteLanding,
  loadChildrenCard,
  inviteLandingView,
  childrenCardView,
  appAccessView,
  claimInviteAction,
  startInviteSignupAction,
  createChildAction,
  createChildInviteAction,
  revokeChildInviteAction,
} from "./child-linking";
// The two gate consumers (`07.09`, `07.59`). Both are pure and three-valued — a closed app and an app we
// could not check are different answers, and neither sub-module flattens them into a boolean.
export { childAppGate } from "./child-development";
export { katieAccessGate } from "./katie";

export { stubApp } from "./app.stub";
