// app/child-development — the child's feed and milestones inside the paid product (ADR-019). `feed-post` is its
// one day-one template (03 §8.2 row 36) and `APP.frameworkLabel` / `APP.maxChildAgeMonths` are its config (L4).
//
// GAP — recorded in the L-005 F-c PROGRESS entry: no foundation section states this sub-module's connector
// signature. Only the vocabulary the foundations name is declared here.
import type { ChildId, Instant, NannyId, UserId } from "@/modules/shared-types";

/** Who wrote a post — a nanny, the parent, or Katie (03 §8.2 row 36). */
export type FeedAuthor =
  | { readonly kind: "nanny"; readonly id: NannyId }
  | { readonly kind: "parent"; readonly id: UserId }
  | { readonly kind: "katie" };

export type FeedPost = {
  readonly childId: ChildId;
  readonly author: FeedAuthor;
  readonly at: Instant;
};
