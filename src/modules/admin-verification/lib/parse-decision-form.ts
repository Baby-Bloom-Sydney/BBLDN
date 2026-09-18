// The decision form's boundary (01 §4a "validate once at the boundary"): the submission id must be a uuid, the
// decision one of two words, a reason one of 03 §4.2's five and required on a rejection, the note bounded. A
// bad field is named so the panel can point at it; nothing else about the body is trusted.
import { z } from "zod";
import type { DecisionInput } from "@/modules/verification";

const UUID = z.string().uuid();
const NOTE_MAX = 500;

const schema = z
  .object({
    submissionId: UUID,
    decision: z.enum(["verified", "rejected"]),
    reason: z
      .enum([
        "document-unreadable",
        "mismatch",
        "expired",
        "adverse",
        "unsupported-evidence",
      ])
      .optional(),
    note: z.string().trim().max(NOTE_MAX).optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .refine((v) => v.decision !== "rejected" || v.reason !== undefined, {
    message: "A rejection needs a reason.",
    path: ["reason"],
  });

export function parseDecisionForm(
  formData: FormData,
):
  | { readonly ok: true; readonly value: DecisionInput }
  | { readonly ok: false; readonly field: string } {
  const raw = {
    submissionId: formData.get("submissionId"),
    decision: formData.get("decision"),
    reason: formData.get("reason") || undefined,
    note: formData.get("note") || undefined,
    expiresAt: formData.get("expiresAt") || undefined,
  };
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      field: String(parsed.error.issues[0]?.path[0] ?? "decision"),
    };
  const v = parsed.data;
  return {
    ok: true,
    value: {
      submissionId: v.submissionId as never,
      decision: v.decision,
      ...(v.reason === undefined ? {} : { reason: v.reason }),
      ...(v.note === undefined || v.note === "" ? {} : { note: v.note }),
      ...(v.expiresAt === undefined ? {} : { expiresAt: v.expiresAt as never }),
    },
  };
}
