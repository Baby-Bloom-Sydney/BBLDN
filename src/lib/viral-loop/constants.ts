// ─── Share Status Codes ───

export const SHARE_STATUS = {
  READY: 10,
  SHARED: 20,
  SUBMITTED: 30,
  PROCESSING: 40,
  APPROVED: 50,
  FAILED: 60,
  BYPASSED: 90,
} as const;

export type ShareStatus = typeof SHARE_STATUS[keyof typeof SHARE_STATUS];

// ─── Case Types ───

export const SHARE_CASE_TYPE = {
  NANNY_PROFILE: 'nanny_profile',
  PARENT_POSITION: 'parent_position',
  PARENT_BSR: 'parent_bsr',
} as const;

export type ShareCaseType = typeof SHARE_CASE_TYPE[keyof typeof SHARE_CASE_TYPE];

// ─── Labels ───

export const SHARE_STATUS_LABELS: Record<ShareStatus, string> = {
  [SHARE_STATUS.READY]: 'Ready',
  [SHARE_STATUS.SHARED]: 'Shared',
  [SHARE_STATUS.SUBMITTED]: 'Submitted',
  [SHARE_STATUS.PROCESSING]: 'Processing',
  [SHARE_STATUS.APPROVED]: 'Approved',
  [SHARE_STATUS.FAILED]: 'Failed',
  [SHARE_STATUS.BYPASSED]: 'Bypassed',
};

export const SHARE_CASE_TYPE_LABELS: Record<ShareCaseType, string> = {
  [SHARE_CASE_TYPE.NANNY_PROFILE]: 'Nanny Profile Share',
  [SHARE_CASE_TYPE.PARENT_POSITION]: 'Parent Position Share',
  [SHARE_CASE_TYPE.PARENT_BSR]: 'Parent BSR Share',
};

// ─── Status Groups ───

/** Status codes that mean "access granted" */
export const SHARE_ACCESS_GRANTED: readonly ShareStatus[] = [
  SHARE_STATUS.APPROVED,
  SHARE_STATUS.BYPASSED,
];

/** Status codes that mean "user needs to take action" */
export const SHARE_USER_ACTION_REQUIRED: readonly ShareStatus[] = [
  SHARE_STATUS.READY,
  SHARE_STATUS.SHARED,
  SHARE_STATUS.FAILED,
];

/** Status codes that are terminal (no further progression expected) */
export const SHARE_TERMINAL_STATUSES: readonly ShareStatus[] = [
  SHARE_STATUS.APPROVED,
  SHARE_STATUS.BYPASSED,
];

/** Status codes where the system is processing (user waits) */
export const SHARE_SYSTEM_PROCESSING: readonly ShareStatus[] = [
  SHARE_STATUS.SUBMITTED,
  SHARE_STATUS.PROCESSING,
];

// ─── Helpers ───

/** Check if a share status means access is granted */
export function isShareAccessGranted(status: number): boolean {
  return status === SHARE_STATUS.APPROVED || status === SHARE_STATUS.BYPASSED;
}

/** Check if a share status is terminal */
export function isShareTerminal(status: number): boolean {
  return (SHARE_TERMINAL_STATUSES as readonly number[]).includes(status);
}

/** Check if the user needs to take action */
export function isShareUserActionRequired(status: number): boolean {
  return (SHARE_USER_ACTION_REQUIRED as readonly number[]).includes(status);
}

// ─── Valid Transitions ───

/** Map of valid status transitions: from -> allowed destinations */
export const VALID_SHARE_TRANSITIONS: Record<ShareStatus, readonly ShareStatus[]> = {
  [SHARE_STATUS.READY]: [SHARE_STATUS.SHARED, SHARE_STATUS.SUBMITTED, SHARE_STATUS.BYPASSED],
  [SHARE_STATUS.SHARED]: [SHARE_STATUS.SUBMITTED, SHARE_STATUS.BYPASSED],
  [SHARE_STATUS.SUBMITTED]: [SHARE_STATUS.PROCESSING, SHARE_STATUS.BYPASSED],
  [SHARE_STATUS.PROCESSING]: [SHARE_STATUS.APPROVED, SHARE_STATUS.FAILED, SHARE_STATUS.BYPASSED],
  [SHARE_STATUS.APPROVED]: [], // terminal
  [SHARE_STATUS.FAILED]: [SHARE_STATUS.SUBMITTED, SHARE_STATUS.BYPASSED], // retry or bypass
  [SHARE_STATUS.BYPASSED]: [], // terminal
};

/** Validate a status transition */
export function isValidShareTransition(from: ShareStatus, to: ShareStatus): boolean {
  // Admin bypass can come from any status
  if (to === SHARE_STATUS.BYPASSED) return true;
  return (VALID_SHARE_TRANSITIONS[from] as readonly number[]).includes(to);
}

// ─── Database Row Type ───

export interface ViralShareRow {
  id: string;
  user_id: string;
  case_type: ShareCaseType;
  reference_id: string;
  share_status: ShareStatus;
  ready_at: string | null;
  shared_at: string | null;
  submitted_at: string | null;
  processing_at: string | null;
  approved_at: string | null;
  failed_at: string | null;
  bypassed_at: string | null;
  screenshot_url: string | null;
  check_result: Record<string, unknown> | null;
  checked_at: string | null;
  fail_reason: string | null;
  retry_count: number;
  bypassed_by: string | null;
  created_at: string;
  updated_at: string;
}
