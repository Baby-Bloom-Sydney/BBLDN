// 03 §1.4 — pure role predicate. There is no `super_admin` (ADR-030; 02 §5 row 7).
import type { Role } from "../types";

export const isAdminRole = (role: Role): boolean => role === "admin";
