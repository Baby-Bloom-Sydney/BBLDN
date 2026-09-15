// 03 §9.3 Stage — position (8): `positions` via `advance` (`amended` via `amend`).
import { z } from "zod";
import { ENUMS } from "@/modules/shared-types";
import { PROPS_PARTS as P } from "../lib/props-parts";

const stage = {
  transition: P.transition,
  from: z.enum(ENUMS.position_stage).nullable().optional(),
  to: z.enum(ENUMS.position_stage),
  source: z.enum(ENUMS.position_source),
  areaDistrict: P.district.optional(),
};

export const POSITION_EVENT_SCHEMAS = Object.freeze({
  "position.drafted": P.props(stage),
  "position.created": P.props(stage),
  "position.connecting": P.props(stage),
  "position.reopened": P.props(stage),
  "position.active": P.props(stage),
  "position.ended": P.props({
    ...stage,
    endReason: z.enum(ENUMS.end_reason).optional(),
    filledByNannyId: P.id.optional(),
  }),
  "position.closed": P.props({
    ...stage,
    closeReason: z.enum(ENUMS.close_reason).optional(),
  }),
  "position.amended": P.props({
    fields: P.fields,
    version: P.count,
    transition: P.transition.optional(),
  }),
});
