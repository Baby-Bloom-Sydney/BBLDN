// **ADR-145 (1)** — the refusal an admin action gives when the caller's two ids do not belong together.
//
// `E_SUBJECT_MISMATCH` is the code the ruling names. There is no central coded-error registry to add it to —
// every module carries its own reason union (`E_MALFORMED_REQUEST` beside this one is `admin`'s), so this is
// `admin`'s vocabulary and the `admin` README is where it is listed.
//
// `FORBIDDEN`, not `VALIDATION`: both ids are well-formed and the caller is an authenticated, MFA'd admin. What
// is refused is the *pairing* — the audit subject 07 §5.4 row 6 rests on — and calling that a typo would hide
// the one event an incident is read from.
import { err } from "@/modules/platform";

export function subjectMismatch(which: string) {
  return err("FORBIDDEN", "That family is not on that position.", {
    reason: "E_SUBJECT_MISMATCH" as const,
    which,
  });
}
