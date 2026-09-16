// `user_roles.role` arrives from Postgres as a plain string. `ENUMS.user_role` (02 §3) is the register, so the
// value is checked against it rather than asserted into the union: migration drift or a hand-edited row must fail
// closed (`null` ⇒ no `Session`, 01 §4d step 2), not produce a `Role` the gate's own tables have no entry for —
// which would redirect someone to `/undefined`.
import { ENUMS } from "@/modules/shared-types";
import type { Role } from "../types";

export function toRole(value: unknown): Role | null {
  return typeof value === "string" &&
    (ENUMS.user_role as ReadonlyArray<string>).includes(value)
    ? (value as Role)
    : null;
}
