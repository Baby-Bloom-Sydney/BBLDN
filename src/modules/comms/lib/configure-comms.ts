// Boot hook (F-c `src/instrumentation.ts`) and test wiring: installs the real seam — `createComms` over the
// provider `emailProviderFor` chose, `nullSmsProvider`, the `email_logs` store and the template renderer.
import type { Comms } from "../types";
import { COMMS_REGISTRY } from "./comms-registry";

export function configureComms(next: Comms): void {
  COMMS_REGISTRY.set(next);
}
