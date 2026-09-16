// 03 §1.4 — pure role predicate.
import type { Role } from "../types";

export const isParentRole = (role: Role): boolean => role === "parent";
