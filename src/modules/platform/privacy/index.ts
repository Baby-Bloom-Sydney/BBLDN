// platform/privacy connector (01 §2.4; 07 §6.1; B-46) — `privacy` is the connector object (`eraseOwnAccount` ·
// `openRequestForEmail` · `runRequest` · `sweepRequests`); `configurePrivacy` is the boot hook over `auth`'s data
// port and the storage surface. `memoryPrivacyStore` (`privacy.stub.ts`) is the stub behind the same port.
//
// Art 15 export (`exportUser`, 07 §6.1's last sentence) is deliberately **not** here: no surface asks for it yet
// and a connector method with no caller is a claim, not a capability.
export type * from "./types";
export { createPrivacy } from "./lib/create-privacy";
export { memoryPrivacyStore } from "./privacy.stub";
export { privacy } from "./lib/default-privacy";
export { configurePrivacy } from "./lib/configure-privacy";
