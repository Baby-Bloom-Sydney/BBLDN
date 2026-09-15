// 03 §9.3 Stage — placement (4): `placements` (`placement.confirmed` from L-1, the K-20 cascade).
import { z } from "zod";
import { ENUMS } from "@/modules/shared-types";
import { PROPS_PARTS as P } from "../lib/props-parts";

const placement = {
  placementId: P.id,
  connectionId: P.id,
  nannyId: P.id,
  startDate: P.isoDate.optional(),
  weeklyHours: z.number().nonnegative().optional(),
  endReason: z.enum(ENUMS.end_reason).optional(),
};

export const PLACEMENT_EVENT_SCHEMAS = Object.freeze({
  "placement.confirmed": P.props(placement),
  "placement.started": P.props(placement),
  "placement.ended": P.props(placement),
  "placement.amended": P.props({
    placementId: P.id,
    connectionId: P.id,
    nannyId: P.id,
    fields: P.fields,
    version: P.count,
  }),
});
