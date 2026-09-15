// 03 §9.3 — the browser-emittable allow-list (`track` → `POST /api/events`; 07 §8 row 4). Everything else is
// server-only: a client emit of any other name is `VALIDATION { reason: 'server-only-name' }`.
import { CLIENT_EVENT_NAMES } from "@/modules/shared-types";
import type { ClientEventName } from "@/modules/shared-types";

const CLIENT_NAMES: ReadonlySet<string> = new Set(CLIENT_EVENT_NAMES);

export const isClientEventName = (name: string): name is ClientEventName =>
  CLIENT_NAMES.has(name);
