// 03 §9.3 Stage — meeting / outcome (9): `connections`.
import { z } from "zod";
import { ENUMS } from "@/modules/shared-types";
import { PROPS_PARTS as P } from "../lib/props-parts";

const meeting = {
  connectionId: P.id,
  nannyId: P.id,
  meetingAt: P.instant.optional(),
  outcome: z.enum(ENUMS.meeting_outcome).optional(),
  trialDate: P.isoDate.optional(),
  fillInitiatedBy: z.enum(ENUMS.user_role).optional(),
};

export const MEETING_EVENT_SCHEMAS = Object.freeze({
  "meeting.scheduled": P.props(meeting),
  "meeting.rescheduled": P.props(meeting),
  "meeting.complete": P.props(meeting),
  "meeting.incomplete": P.props(meeting),
  "outcome.recorded": P.props(meeting),
  "trial.arranged": P.props(meeting),
  "trial.complete": P.props(meeting),
  "offer.made": P.props(meeting),
  "offer.withdrawn": P.props(meeting),
});
