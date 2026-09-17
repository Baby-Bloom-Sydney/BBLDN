// 03 §2.1 / §2.5 — the P rows register through the same one mechanism every other slice uses (§12 item 35), so
// boot has no special case for the module that happens to own `advance`. Called once from the boot file beside
// `configurePositions`.
import type { PositionsSlice } from "../types";
import { registerSlice } from "./register-slice";

export function registerPositionsSlice(handlers: PositionsSlice): void {
  registerSlice({ entity: "position", handlers });
}
