// 05 §3 rule 1 — the calendar implementation is selected here, never by editing an import: the stub, the real
// inside, or (03 §11 row 2) an external provider honouring the same `Scheduling` type.
import type { Scheduling } from "../types";
import { SCHEDULING_REGISTRY } from "./scheduling-registry";

export function configureScheduling(next: Scheduling): void {
  SCHEDULING_REGISTRY.set(next);
}
