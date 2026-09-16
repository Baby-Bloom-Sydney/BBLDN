// app/child-linking — children, invites and the family ↔ nanny link (ADR-019; 03 §9.3 "App / invite"). It is the
// caller of `payments.startTrial` on a family's first child (self-serve only — ADR-093) and the owner of the
// consent records a child link needs (`platform/consent`, 02 R-4).
import type {
  ChildId,
  FamilyId,
  ISODate,
  NannyId,
  Result,
} from "@/modules/shared-types";

export type ChildLink = {
  readonly childId: ChildId;
  readonly familyId: FamilyId;
  readonly dateOfBirth: ISODate;
  readonly linkedNannyIds: ReadonlyArray<NannyId>;
};

export type ChildLinkingErrorDetails = {
  readonly reason: "child-linking-not-configured" | "E_CHILD_NOT_FOUND";
};

export type ChildLinkingResult<T> = Result<T, ChildLinkingErrorDetails>;

/**
 * The reads the rest of the app needs from the link graph.
 *
 * GAP — recorded in the L-005 F-c PROGRESS entry. ADR-083 / 084 state the **rule** ("access runs until the
 * youngest linked child turns 3, recomputed on every child link") and 03 §5.2 puts `accessUntil` on
 * `AccessState`, but no section names the method that computes it or where it lives. This is the provisional
 * shape; `payments` and `access-gate` both want it, so it is declared once here, on the module that owns the
 * children.
 */
export type ChildLinkingReads = {
  readonly linkedChildren: (
    familyId: FamilyId,
  ) => Promise<ChildLinkingResult<ReadonlyArray<ChildLink>>>;
  /** The youngest linked child's date of birth; `null` until a child is linked (ADR-083 / 084). */
  readonly youngestChildDateOfBirth: (
    familyId: FamilyId,
  ) => Promise<ChildLinkingResult<ISODate | null>>;
};
