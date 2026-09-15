// 03 §9.3 Stage — connection (9): `connections`. `origin` is the contract's union (03 §9.3), not 02's
// `connection_origin` enum — the two vocabularies differ; raised as a foundations gap in the S3 PROGRESS entry.
import { z } from "zod";
import { ENUMS } from "@/modules/shared-types";
import { PROPS_PARTS as P } from "../lib/props-parts";

const stage = {
  connectionId: P.id,
  nannyId: P.id,
  transition: P.transition,
  from: z.enum(ENUMS.connection_stage).nullable().optional(),
  to: z.enum(ENUMS.connection_stage),
  origin: z.enum(["self-serve", "on-behalf", "autofire", "applied"]).optional(),
};

export const CONNECTION_EVENT_SCHEMAS = Object.freeze({
  "connection.requested": P.props(stage),
  "connection.applied": P.props(stage),
  "connection.accepted": P.props(stage),
  "connection.declined": P.props(stage),
  "connection.cancelled": P.props(stage),
  "connection.expired": P.props(stage),
  "connection.not-selected": P.props(stage),
  "connection.finished": P.props(stage),
  "connection.amended": P.props({
    connectionId: P.id,
    nannyId: P.id,
    fields: P.fields,
    version: P.count,
  }),
});
