// 03 §9.3 Stage — pre-check (3): `matching` (`autofire`) · `connections` (K-2).
import { z } from "zod";
import { ERROR_CODES } from "@/modules/shared-types";
import { PROPS_PARTS as P } from "../lib/props-parts";

export const PRECHECK_EVENT_SCHEMAS = Object.freeze({
  "precheck.fired": P.props({
    candidateCount: P.count,
    rankedCount: P.count,
    excludedByReason: z.record(P.label, P.count).optional(),
    providerKind: P.label.optional(),
  }),
  "precheck.failed": P.props({ code: z.enum(ERROR_CODES), requestId: P.label }),
  "precheck.responded": P.props({
    nannyId: P.id,
    available: z.boolean(),
    slotsGiven: P.count.optional(),
  }),
});
