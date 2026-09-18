// 02 §4.3's level derivation, top-down, in TypeScript — the same rule `sync_nanny_verification_state()` runs in
// SQL (`0023`, ADR-157), pinned equal by `int.rpc-0023` over the whole matrix so the two cannot drift. Pure. The
// memory store (05 §3 rule 2) and the admin screens read this one; the database is written by the SQL one and
// never by a client naming a level.
//
// Which sections a level requires is `VETTING.requiredChecksByLevel` (evidence types), mapped to sections here —
// right-to-work is in no list, so it never moves the level (ADR-153), and an emptied L2–L4 list makes that level
// unreachable rather than free (the SQL refuses the call; this side answers the same "not satisfied").
import type { EvidenceType } from "@/modules/shared-types";
import type { LevelFacts, VerificationLevel } from "../types";
import { requiredSectionsByLevel } from "./required-sections-by-level";

type RequiredChecks = Readonly<
  Record<VerificationLevel, ReadonlyArray<EvidenceType>>
>;

const satisfied = (
  facts: LevelFacts,
  sections: ReadonlyArray<string> | undefined,
): boolean =>
  sections !== undefined &&
  sections.length > 0 &&
  sections.every(
    (section) =>
      facts.sections[section as keyof LevelFacts["sections"]] === "verified",
  );

export function deriveLevel(
  facts: LevelFacts,
  requiredChecks: RequiredChecks,
): VerificationLevel {
  const required = requiredSectionsByLevel(requiredChecks);
  if (facts.dbsOutcome === "barred") return "L0_SIGNED_UP";
  const cleared = facts.dbsOutcome === "cleared" && facts.crossCheckPassed;
  if (
    satisfied(facts, required.L4_FULLY_VERIFIED) &&
    cleared &&
    facts.updateServiceConfirmed
  )
    return "L4_FULLY_VERIFIED";
  if (satisfied(facts, required.L3_PROVISIONALLY_VERIFIED) && cleared)
    return "L3_PROVISIONALLY_VERIFIED";
  if (satisfied(facts, required.L2_ID_VERIFIED)) return "L2_ID_VERIFIED";
  if (facts.sections.identity !== "not_started") return "L1_REGISTERED";
  return "L0_SIGNED_UP";
}
