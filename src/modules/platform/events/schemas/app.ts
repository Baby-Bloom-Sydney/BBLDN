// 03 §9.3 Usage (1) — job `usage-weekly-check`; App / invite (4) — `app/child-linking`.
import { z } from "zod";
import { PROPS_PARTS as P } from "../lib/props-parts";

const inviterRole = z.enum(["parent", "nanny"]);
const invite = {
  inviteId: P.id,
  inviterRole,
  childCount: P.count.optional(),
  nannyId: P.id.optional(),
};
const appIn = {
  inviteId: P.id.optional(),
  inviterRole: inviterRole.optional(),
  childCount: P.count.optional(),
  nannyId: P.id.optional(),
};

export const APP_EVENT_SCHEMAS = Object.freeze({
  "usage.weekly-check": P.props({
    familyId: P.id,
    childId: P.id,
    weekStart: P.isoDate,
    postCount: P.count,
    low: z.boolean(),
  }),
  "invite.sent": P.props(invite),
  "invite.claimed": P.props(invite),
  "app.family-in": P.props(appIn),
  "app.nanny-in": P.props(appIn),
});
