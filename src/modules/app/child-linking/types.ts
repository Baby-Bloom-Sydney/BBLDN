// app/child-linking — children, invites and the family ↔ nanny link (ADR-019; 03 §9.3 "App / invite"). It is the
// caller of `payments.startTrial` on a family's first child (self-serve only — ADR-093) and, since `1i`, of
// `set_access_window` **at the link** (ADR-083 / 084): the window moved when money moved and not when a child
// was linked, which is half of ADR-084 and was owed here.
//
// **Neither call is an import.** 01 §2.3 gives `app` no arrow to `payments`, and the boundary lint enforces it;
// 03 §5.4.4 nonetheless names `app/child-linking` as `startTrial`'s caller. Both are therefore **injected
// ports** filled by `src/boot/wire-app.ts` — the shape `placements` already uses for `openDfyAccess` (`1g`), and
// the reason the arrow does not need to exist.
import type {
  Actor,
  ChildId,
  FamilyId,
  ISODate,
  Instant,
  InviteId,
  NannyId,
  Result,
  UserId,
} from "@/modules/shared-types";

/** 02 §3 `invite_direction`. Who is being invited — not who minted the row. */
export type InviteDirection = "nanny_to_parent" | "parent_to_nanny";

/** 02 §3 `invite_status`. There is no `expired`: an invite ends by claim, revoke or child deletion. */
export type InviteStatus = "pending" | "connected" | "revoked";

/** 02 §3 `invite_revoked_reason`. No `regenerated` member — rotation does not exist (memory: token stability). */
export type InviteRevokedReason = "manual" | "child_deleted";

export type ChildLink = {
  readonly childId: ChildId;
  readonly familyId: FamilyId;
  readonly dateOfBirth: ISODate;
  readonly linkedNannyIds: ReadonlyArray<NannyId>;
};

/** The child record itself (02 §4.6 `children`) — the family's, whether or not a nanny is linked to it. */
export type ChildRecord = {
  readonly id: ChildId;
  readonly firstName: string;
  readonly dateOfBirth: ISODate;
  readonly parentUserId: UserId | null;
  readonly createdAt: Instant;
};

/** What a parent or a nanny hands `createChild`. The owner is the actor's id; it is never taken from input. */
export type NewChild = {
  readonly firstName: string;
  readonly dateOfBirth: ISODate;
};

export type ChildInvite = {
  readonly id: InviteId;
  readonly childId: ChildId;
  readonly token: string;
  readonly direction: InviteDirection;
  readonly status: InviteStatus;
  readonly createdAt: Instant;
  /** The share URL, built from `URLS.invite` — never a literal (L4). */
  readonly url: string;
};

/**
 * The anonymous preview (`get_invite_preview`, 02 §7 — the one anon path into this cluster). It carries a
 * child's first name and the inviter's first name and **nothing else**: no ids, no email, no surname.
 */
export type InvitePreview = {
  readonly childFirstName: string;
  readonly direction: InviteDirection;
  readonly invitedBy: string;
};

/** A row of `get_pending_invites_for_recipient` — what the hub's "someone invited you" section renders. */
export type PendingInvite = {
  readonly inviteId: InviteId;
  readonly childId: ChildId;
  readonly childFirstName: string;
  readonly direction: InviteDirection;
  readonly createdAt: Instant;
};

/** What a claim did. `trialEndsAt` is `null` for a done-for-you family and for one that has had its trial. */
export type ClaimOutcome = {
  readonly childId: ChildId;
  readonly familyId: FamilyId;
  readonly direction: InviteDirection;
  /** ADR-083 / 084 — the window `set_access_window` recomputed at the link, or `null` with no child yet. */
  readonly accessUntil: Instant | null;
  readonly trialEndsAt: Instant | null;
};

/**
 * Rail row 8's facts (04 §7.1 "App — family + nanny in"). Deliberately facts, not a rendered row: `positions`
 * composes the rail and may not import `app` (01 §2.3), so the words are assembled where the rail lives and
 * these three booleans are what travel.
 */
export type AppLinkFacts = {
  readonly hasChild: boolean;
  readonly invitePending: boolean;
  readonly nannyLinked: boolean;
};

export type ChildLinkingErrorReason =
  | "child-linking-not-configured"
  | "E_CHILD_NOT_FOUND"
  | "E_ACTOR_FORBIDDEN"
  | "E_CHILD_TOO_OLD"
  | "E_INVITE_TOKEN_INVALID"
  | "E_INVITE_NOT_FOUND"
  | "E_INVITE_NOT_YOURS"
  | "E_INVITE_WRONG_ROLE"
  | "E_CHILD_ALREADY_CLAIMED"
  | "E_CHILD_ALREADY_LINKED"
  | "E_STORE";

export type ChildLinkingErrorDetails = {
  readonly reason: ChildLinkingErrorReason;
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

/**
 * The write half (`1i`). Every method takes the `Actor` rather than reading a session, so an admin acting on
 * behalf (S-A-11, `09.28`) travels the same road as the family and lands in the same audit trail (03 §2.5).
 */
export type ChildLinkingWrites = {
  /** 07.50 — the child creation paths. A parent's first child starts the trial and sets the access window. */
  readonly createChild: (
    input: NewChild,
    actor: Actor,
  ) => Promise<ChildLinkingResult<ChildRecord>>;
  /** 02.16 — mint the invite. Idempotent per (child, direction): a pending row is returned, never replaced. */
  readonly createInvite: (
    childId: ChildId,
    direction: InviteDirection,
    actor: Actor,
  ) => Promise<ChildLinkingResult<ChildInvite>>;
  /** Revoke is the only invalidation path (memory: token stability). */
  readonly revokeInvite: (
    inviteId: InviteId,
    reason: InviteRevokedReason,
    actor: Actor,
  ) => Promise<ChildLinkingResult<ChildInvite>>;
  /** 07.51 — the claim. `connect_child_invite`, then the access window, then the trial, then the events. */
  readonly claimInvite: (
    token: string,
    actor: Actor,
  ) => Promise<ChildLinkingResult<ClaimOutcome>>;
};

/** 07.52 — the landing page's read and the recipient's pending list. The first is the only anon path. */
export type ChildLinkingLookups = {
  readonly invitePreview: (
    token: string,
  ) => Promise<ChildLinkingResult<InvitePreview | null>>;
  readonly pendingInvites: (
    userId: UserId,
  ) => Promise<ChildLinkingResult<ReadonlyArray<PendingInvite>>>;
  readonly invitesForChild: (
    childId: ChildId,
    actor: Actor,
  ) => Promise<ChildLinkingResult<ReadonlyArray<ChildInvite>>>;
  readonly childrenOfFamily: (
    familyId: FamilyId,
  ) => Promise<ChildLinkingResult<ReadonlyArray<ChildRecord>>>;
  readonly appLinkFacts: (
    familyId: FamilyId,
  ) => Promise<ChildLinkingResult<AppLinkFacts>>;
};

export type ChildLinking = ChildLinkingReads &
  ChildLinkingWrites &
  ChildLinkingLookups;

// ── S-N-01 (`2g`) — the nanny's "add a family you already work for" surface ──

/**
 * `addFamilyChildAction`'s one state. `url` is the link she copies and passes to that family; `error` is the
 * one line the form shows. Never both: a mint either happened or it did not (04 §6.3 S-N-01's two states).
 */
export type AddFamilyChildState = {
  readonly url: string | null;
  readonly error: string | null;
};

/** S-N-01's props. Every href is a prop and the pitch links on to S-N-02 (04 §4.4 c1 → c2). */
export type NannyAddChildPitchProps = {
  readonly commissionHref: string;
  readonly skipHref: string;
  readonly skipLabel: string;
};
