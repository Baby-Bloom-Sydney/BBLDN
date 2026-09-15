// Branded ids named by the contracts (03 §1.4 auth · §2.5 stage model · §3.2 scheduling · §4.2 vetting ·
// §5.2 purchase · §9.2 events · 02 §4). One type group; every id is a `Brand<string, …>` so ids never cross.
import type { Brand } from "./brand";

export type Ids = {
  UserId: Brand<string, "UserId">;
  AdminId: Brand<string, "AdminId">;
  ParentId: Brand<string, "ParentId">;
  NannyId: Brand<string, "NannyId">;
  FamilyId: Brand<string, "FamilyId">;
  PositionId: Brand<string, "PositionId">;
  ConnectionId: Brand<string, "ConnectionId">;
  PlacementId: Brand<string, "PlacementId">;
  BookingId: Brand<string, "BookingId">;
  HoldId: Brand<string, "HoldId">;
  RuleId: Brand<string, "RuleId">;
  BlockId: Brand<string, "BlockId">;
  EvidenceId: Brand<string, "EvidenceId">;
  SubmissionId: Brand<string, "SubmissionId">;
  ConsentRecordId: Brand<string, "ConsentRecordId">;
  ChildId: Brand<string, "ChildId">;
  InviteId: Brand<string, "InviteId">;
  LeadId: Brand<string, "LeadId">;
  EventId: Brand<string, "EventId">;
  VisitorId: Brand<string, "VisitorId">;
  /** Minted by `payments`, never the provider's id (03 §5.2). */
  LinkRef: Brand<string, "LinkRef">;
  /** The provider's customer handle, opaque outside `purchase-paths` (03 §5.2). */
  CustomerRef: Brand<string, "CustomerRef">;
  /** `email_logs.id` (03 §8.1 — a plain string in the contract; branded here). */
  MessageId: Brand<string, "MessageId">;
};

export type UserId = Ids["UserId"];
export type AdminId = Ids["AdminId"];
export type ParentId = Ids["ParentId"];
export type NannyId = Ids["NannyId"];
export type FamilyId = Ids["FamilyId"];
export type PositionId = Ids["PositionId"];
export type ConnectionId = Ids["ConnectionId"];
export type PlacementId = Ids["PlacementId"];
export type BookingId = Ids["BookingId"];
export type HoldId = Ids["HoldId"];
export type RuleId = Ids["RuleId"];
export type BlockId = Ids["BlockId"];
export type EvidenceId = Ids["EvidenceId"];
export type SubmissionId = Ids["SubmissionId"];
export type ConsentRecordId = Ids["ConsentRecordId"];
export type ChildId = Ids["ChildId"];
export type InviteId = Ids["InviteId"];
export type LeadId = Ids["LeadId"];
export type EventId = Ids["EventId"];
export type VisitorId = Ids["VisitorId"];
export type LinkRef = Ids["LinkRef"];
export type CustomerRef = Ids["CustomerRef"];
export type MessageId = Ids["MessageId"];
