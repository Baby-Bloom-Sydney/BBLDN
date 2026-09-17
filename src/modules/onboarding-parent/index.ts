// onboarding-parent connector (01 §2.3) — signup with the UK mobile + promise line, the passwordless catch and the
// post-signup route to the call page (`03.36`). It may import `call-layer`, `positions`, `matching` and the
// service modules; it never imports `scheduling` (03 §3.6 R3) — the slot picker is `call-layer`'s.
export type * from "./types";

// Boot hooks: the `user_profiles` + `user_roles` write (02 §4.1) behind a registry that fails closed until the
// boot installs an adapter over `0017`'s `create_parent_profile`. `parentProfileStore` is the binding itself —
// exported like every other module-level binding so the composition root's own suite can assert what it bound,
// rather than reaching past the connector into `lib/`.
export { configureParentProfileStore } from "./lib/configure-parent-profile-store";
export { memoryParentProfileStore } from "./lib/memory-parent-profile-store";
export { parentProfileStore } from "./lib/default-parent-profile-store";

// The three actions the `(auth)` + `(funnel)` route files pass to their forms (01 §2.5 "route files are thin").
export { signUpParentAction } from "./actions/sign-up-parent-action";
export { signInAction } from "./actions/sign-in-action";
export { requestPasswordResetAction } from "./actions/request-password-reset-action";

// `1e` — S-P-04's one action (04 §3.3 trigger b): the in-app position flow opens the position and answers S-P-01.
export { createPositionAction } from "./actions/create-position-action";
export { PARENT_CALL_PATH } from "./lib/parent-call-path";

// Pure helpers other units read: where a parent lands after signup (`1d`), a safe `next=` (any route).
export { postSignupDestination } from "./lib/post-signup-destination";
export { safeNextPath } from "./lib/safe-next-path";
export { signupContextFromQuery } from "./lib/signup-context-from-query";
export { authCallbackDestination } from "./lib/auth-callback-destination";
export { normaliseUkMobile } from "./lib/normalise-uk-mobile";
export { SIGNUP_COPY } from "./lib/signup-copy";

// Screens (04 §6.1 S-X-05 · S-X-06 · S-X-08 · S-X-09 forgot half) and the `(auth)` group chrome.
export { ParentSignupForm } from "./components/ParentSignupForm";
export { SignInForm } from "./components/SignInForm";
export { ForgotPasswordForm } from "./components/ForgotPasswordForm";
export { AuthShell } from "./components/AuthShell";
