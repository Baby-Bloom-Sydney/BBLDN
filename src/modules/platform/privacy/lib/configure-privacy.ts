// Boot hook: installs `createPrivacy({ store, log, onErased })` built over `auth`'s data port (`src/boot`) — or
// over `memoryPrivacyStore()` in test wiring.
import type { Privacy } from "../types";
import { PRIVACY_REGISTRY } from "./privacy-registry";

export function configurePrivacy(connector: Privacy): void {
  PRIVACY_REGISTRY.set(connector);
}
