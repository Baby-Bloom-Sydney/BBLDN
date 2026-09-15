// The one enum register (02 §3 — "One list, canonical names; values add-only. Ordinal maps in shared-types").
// Each cluster file holds its enums as frozen tuples; the tuple index IS the ordinal (02 C-1, 03 §2.6 I-7).
// Consumers read `ENUMS.<enum>` for the values and `EnumValue<'<enum>'>` (types.ts) for the union.
import { APP_ENUMS } from "./app";
import { COMMS_ENUMS } from "./comms";
import { KATIE_ENUMS } from "./katie";
import { LEADS_ENUMS } from "./leads";
import { MARKETPLACE_ENUMS } from "./marketplace";
import { MONEY_ENUMS } from "./money";
import { SCHEDULING_ENUMS } from "./scheduling";
import { SHARED_ENUMS } from "./shared";
import { VERIFICATION_ENUMS } from "./verification";

export const ENUMS = Object.freeze({
  ...SHARED_ENUMS,
  ...MARKETPLACE_ENUMS,
  ...VERIFICATION_ENUMS,
  ...SCHEDULING_ENUMS,
  ...MONEY_ENUMS,
  ...APP_ENUMS,
  ...KATIE_ENUMS,
  ...COMMS_ENUMS,
  ...LEADS_ENUMS,
});
