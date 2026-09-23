// 03 §9.5 day-one map — our event name → Meta's standard-event name, read from `config/meta-events.ts` and
// nowhere else (L4). `undefined` means "this event is not a conversion", and the sink sends nothing for it:
// the map is an allow-list, so a name appended to the taxonomy later reaches Meta only when somebody puts it
// in the map on purpose.
import { META_EVENTS } from "@/modules/config";
import type { EventName } from "@/modules/shared-types";

const MAP: Readonly<Partial<Record<EventName, string>>> = META_EVENTS.map;

export function metaEventName(name: EventName): string | undefined {
  return MAP[name];
}
