// The eight panels, in nav order (00-glossary §3; 01 §2.3; 04 §6.4). One list, assembled from each panel's own
// descriptor so a panel folder and this set can never disagree — the swap test pins both the count and the names.
import type { AdminPanel } from "../types";
import { CALL_QUEUE_PANEL } from "../call-queue";
import { CALENDAR_PANEL } from "../calendar";
import { POSITIONS_PANEL } from "../positions-panel";
import { PIPELINE_PANEL } from "../pipeline";
import { LEADS_PANEL } from "../leads";
import { USERS_PANEL } from "../users";
import { SUPPORT_PANEL } from "../support";
import { GUARANTEES_PANEL } from "../guarantees";

export const ADMIN_PANELS: ReadonlyArray<AdminPanel> = Object.freeze([
  CALL_QUEUE_PANEL,
  CALENDAR_PANEL,
  POSITIONS_PANEL,
  PIPELINE_PANEL,
  LEADS_PANEL,
  USERS_PANEL,
  SUPPORT_PANEL,
  GUARANTEES_PANEL,
]);
