// comms/email connector (01 §2.5 sub-module) — the parent's `index.ts` re-exports what the outside may use.
export type * from "./types";
export { stubEmailProvider } from "./stub-email";
export { createResendEmailProvider } from "./resend-email";
