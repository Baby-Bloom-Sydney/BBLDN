// The one schema map: 03 §9.3's 88 names → their props schema (per-group files, composed here like the enum
// register). `satisfies Record<EventName, …>` pins that every name has exactly one schema and no extra exists.
import type { z } from "zod";
import type { EventName } from "@/modules/shared-types";
import { APP_EVENT_SCHEMAS } from "./app";
import { BOOKING_EVENT_SCHEMAS } from "./booking";
import { CALL_EVENT_SCHEMAS } from "./call";
import { CONNECTION_EVENT_SCHEMAS } from "./connection";
import { FUNNEL_EVENT_SCHEMAS } from "./funnel";
import { MEETING_EVENT_SCHEMAS } from "./meeting";
import { PLACEMENT_EVENT_SCHEMAS } from "./placement";
import { PLATFORM_EVENT_SCHEMAS } from "./platform";
import { POSITION_EVENT_SCHEMAS } from "./position";
import { PRECHECK_EVENT_SCHEMAS } from "./precheck";
import { PURCHASE_EVENT_SCHEMAS } from "./purchase";
import { VERIFICATION_EVENT_SCHEMAS } from "./verification";

export const EVENT_SCHEMAS = Object.freeze({
  ...POSITION_EVENT_SCHEMAS,
  ...PRECHECK_EVENT_SCHEMAS,
  ...CALL_EVENT_SCHEMAS,
  ...CONNECTION_EVENT_SCHEMAS,
  ...MEETING_EVENT_SCHEMAS,
  ...PLACEMENT_EVENT_SCHEMAS,
  ...BOOKING_EVENT_SCHEMAS,
  ...FUNNEL_EVENT_SCHEMAS,
  ...PURCHASE_EVENT_SCHEMAS,
  ...APP_EVENT_SCHEMAS,
  ...VERIFICATION_EVENT_SCHEMAS,
  ...PLATFORM_EVENT_SCHEMAS,
} satisfies Readonly<Record<EventName, z.ZodType>>);
