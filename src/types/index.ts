export type UserRole = "nanny" | "parent" | "admin" | "super_admin";

export type VerificationTier = 1 | 2 | 3;

export type RequestStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";
