// 01 §2.3 + 03 §4.3 — the admin verification queue S-A-16 and the reference crib S-A-17 (ADR-159). This module
// reaches providers **through** `verification`, never directly (03 §4.2), and it decorates rather than decides:
// the queue's rows are `verification`'s `QueueEntry`s with a name from `auth` beside them (03 §3.6's pattern for
// the call list), the decision is `verification.decide`, the reveal `verification.openEvidence`.
import type { ClientResult } from "@/modules/platform";
import type {
  AdminOverview,
  DecisionOutcome,
  EvidenceOpen,
  LevelSync,
  QueueEntry,
  QueueFilter,
  QueueRecord,
  UpdateServiceResult,
  VerificationErrorDetails,
  VerificationSection,
} from "@/modules/verification";

/** 03 §4.3: "S-A-16 shows all three tabs". */
export type QueueTab = VerificationSection;

export type QueueQuery = {
  readonly tab: QueueTab;
  readonly filter: QueueFilter;
};

/** A row as S-A-16 lists it: `verification`'s entry plus the person's name (04 §7.1 `{nanny}`). */
export type QueueRow = QueueEntry & {
  readonly nannyName: string;
};

/** S-A-16's open row, decorated the same way. */
export type OpenRecord = QueueRecord & { readonly nannyName: string };

/** What the route hands the screen (05 §7 rule 5 — the route file is thin, the read is here). */
export type VerificationQueueView =
  | {
      readonly kind: "queue";
      readonly query: QueueQuery;
      readonly rows: ReadonlyArray<QueueRow>;
      readonly overview: AdminOverview;
      readonly open: OpenRecord | null;
    }
  | { readonly kind: "forbidden" }
  | { readonly kind: "unavailable" };

// ── Actions (01 §4e) ──

export type ActionDetails =
  | VerificationErrorDetails
  | { readonly reason: "invalid-input"; readonly field: string };

export type DecideSubmissionAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<DecisionOutcome, ActionDetails>>;

export type OpenEvidenceAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<EvidenceOpen, ActionDetails>>;

export type RecordUpdateServiceAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<LevelSync, ActionDetails>>;

export type VerificationQueueActions = {
  readonly decide: DecideSubmissionAction;
  readonly openEvidence: OpenEvidenceAction;
  readonly recordUpdateService: RecordUpdateServiceAction;
};

// ── Component props ──

export type VerificationQueueProps = {
  readonly view: VerificationQueueView;
  readonly actions: VerificationQueueActions;
  /** the route the tabs, filters and rows link to (S-A-16's own path, 04 §6.4) */
  readonly basePath: string;
};

export type SubmissionPanelProps = {
  readonly record: OpenRecord;
  readonly actions: VerificationQueueActions;
  readonly updateServiceResults: ReadonlyArray<UpdateServiceResult>;
};

/** S-A-17: one static crib built from the enums and the config, never a Sydney code. */
export type VerificationReferenceProps = {
  readonly minVerificationLevel: number;
};
