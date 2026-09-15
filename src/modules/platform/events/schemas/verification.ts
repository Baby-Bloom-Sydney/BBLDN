// 03 §9.3 Verification (5): `verification` · `admin-verification` (`evidence-viewed`, 07 §4.32); Vetting (8):
// `vetting-providers`. Evidence types = `config/vetting.ts` `acceptedEvidence` (03 §4.2).
import { z } from "zod";
import { VETTING } from "@/modules/config";
import { ENUMS } from "@/modules/shared-types";
import { PROPS_PARTS as P } from "../lib/props-parts";

const level = z.enum(ENUMS.verification_level);
const evidenceType = z.enum(VETTING.acceptedEvidence);
const verification = {
  nannyId: P.id,
  check: z.enum(["dbs", "right-to-work", "id"]),
  fromLevel: level.optional(),
  toLevel: level.optional(),
  holdReason: P.label.optional(),
};
const vetting = {
  submissionId: P.id,
  evidenceType,
  provider: P.label,
  statusKind: P.label.optional(),
  rejectReason: P.label.optional(),
  expiresAt: P.instant.optional(),
  decision: P.label.optional(),
};

export const VERIFICATION_EVENT_SCHEMAS = Object.freeze({
  "verification.submitted": P.props(verification),
  "verification.level-changed": P.props({ ...verification, toLevel: level }),
  "verification.held": P.props(verification),
  "verification.released": P.props(verification),
  "vetting.evidence-viewed": P.props({
    submissionId: P.id,
    evidenceType,
    viewerAdminId: P.id,
  }),
  "vetting.submitted": P.props(vetting),
  "vetting.extracted": P.props(vetting),
  "vetting.checked": P.props(vetting),
  "vetting.needs-admin": P.props(vetting),
  "vetting.decision-recorded": P.props(vetting),
  "vetting.expiry-approaching": P.props(vetting),
  "vetting.expired": P.props(vetting),
  "vetting.provider-unavailable": P.props(vetting),
});
