// 02 §3 `verification_level` → the 0–4 ordinal `scoring` compares against `MATCHING.minVerificationLevel`
// (05.22 names, 0–4 order — the tuple's index is the ordinal). Unknown → 0, never a pass.
import { ENUMS } from "@/modules/shared-types";

export function verificationLevelOrdinal(level: string | null): number {
  const index = (ENUMS.verification_level as ReadonlyArray<string>).indexOf(
    level ?? "",
  );
  return index < 0 ? 0 : index;
}
