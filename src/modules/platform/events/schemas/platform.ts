// 03 §9.3 Nanny onboarding (2) — `onboarding-nanny`; Comms (4) — `comms` (no address, ever); Platform (2) —
// `platform` · any component; Retention (2) — the `delete-account` · `retention-sweep` jobs.
import { z } from "zod";
import { ENUMS } from "@/modules/shared-types";
import { PROPS_PARTS as P } from "../lib/props-parts";

const message = {
  messageId: P.id,
  templateId: P.label,
  channel: z.enum(ENUMS.message_channel),
  recipientUserId: P.id.optional(),
  providerMessageId: P.label.optional(),
};

export const PLATFORM_EVENT_SCHEMAS = Object.freeze({
  "nanny.applied": P.props({
    nannyId: P.id,
    path: z.enum(["apply", "apply-from-portal"]),
    areaDistrict: P.district.optional(),
  }),
  "nanny.isolation-lifted": P.props({
    nannyId: P.id,
    path: z.enum(["apply", "apply-from-portal"]),
    areaDistrict: P.district.optional(),
  }),
  "message.queued": P.props(message),
  "message.sent": P.props(message),
  "message.failed": P.props(message),
  "message.cancelled": P.props(message),
  "consent.updated": P.props({
    marketing: z.boolean(),
    necessary: z.boolean(),
    analytics: z.boolean().optional(),
  }),
  "ui.click": P.props({ surface: P.label, target: P.label }),
  "account.deleted": P.props({
    userId: P.id,
    scrubbedTables: z.array(P.label),
    objectCount: P.count.optional(),
  }),
  "retention.applied": P.props({
    retentionRow: P.label,
    rowCount: P.count,
    objectCount: P.count,
  }),
});
