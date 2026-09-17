// What the child-linking rules are given (01 §2.5 — the inside takes its collaborators, it does not reach for
// them). Two of the five are **ports declared structurally rather than imported**, and that is the whole reason
// this module can do what 03 §5.4.4 asks of it:
//
//   01 §2.3 gives `app` arrows to `config` · `shared-types` · `areas` · `auth` · `comms` · `platform` and
//   nothing else. It has **no arrow to `payments`**, and `lint:boundaries` enforces that. 03 §5.4.4 nonetheless
//   names `app/child-linking` as the caller of `startTrial`, and ADR-083 / 084 make it the caller of
//   `set_access_window` at the link. Injecting both as functions satisfies the contract without widening the
//   table: `src/boot/wire-app.ts` holds the one place where `payments` and `app` are both in scope, which is
//   exactly the shape `wire-placements.ts` uses for `openDfyAccess` (`1g`).
//
// **Both ports are optional and both fail soft, deliberately.** A trial that could not start and a window that
// could not be recomputed are worth a warning and a retry; neither is worth refusing a family the child they
// just added or the nanny they just linked. The link is the fact; access is derived from it, and the crons and
// the next paid transition both recompute the window from the same rows.
import type { EventsConnector } from "@/modules/platform";
import type {
  Actor,
  ErrorCode,
  FamilyId,
  Instant,
} from "@/modules/shared-types";
import type { ChildLinkingStore } from "./child-linking-store";

/** A generic two-armed result, named here so neither port's shape is an `any` in disguise. */
export type PortResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error: { readonly code: ErrorCode; readonly message: string };
    };

/**
 * `payments.startTrial` seen from this side of the boundary. The success arm is deliberately the union
 * `payments` returns: `{ alreadyUsed: true }` is **not** an error (03 §5.3), and a done-for-you family's
 * `E_DFY_FAMILY` is an error arm this module logs and moves past (ADR-093 — that family has no trial and needs
 * none, because `openDfyAccess` opened the app on the nanny's first day).
 */
export type StartTrialPort = (
  familyId: FamilyId,
  actor: Actor,
) => Promise<
  PortResult<{
    readonly trialEndsAt?: string;
    readonly alreadyUsed?: boolean;
  }>
>;

/** RPC `set_access_window` (02 §7; ADR-083 / 084) — `null` when the family has no child yet. */
export type SetAccessWindowPort = (
  familyId: FamilyId,
) => Promise<PortResult<string | null>>;

export type ChildLinkingDeps = {
  readonly store: ChildLinkingStore;
  readonly events: Pick<EventsConnector, "emit">;
  readonly now: () => Instant;
  /** `URLS.invite` — the share link's base. Never a literal in a rule or a screen (L4). */
  readonly inviteBaseUrl: string;
  readonly startTrial?: StartTrialPort;
  readonly setAccessWindow?: SetAccessWindowPort;
};
