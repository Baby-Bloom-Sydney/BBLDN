// 01 §3.1 — connection windows and follow-up offsets (03 §2.4 K-8 / K-10 / K-12 / K-15; ADR-018 self-serve path
// stays), the meeting brackets K-9 reads (02 §9 item 22 — Sydney values as seed) and the one-live-position constants
// (03 §2.6 I-1). Sydney-carried windows are [unverified] until Phase 1f pins them.
export const CONNECTIONS = Object.freeze({
  requestWindowHours: 72, // K-8 `config.connections.requestWindow` — [unverified] Sydney seed
  scheduleWindowDays: 7, // K-10 accepted → SCHEDULE_EXPIRED — [unverified] Sydney seed
  followUps: Object.freeze({
    meetingFollowupNannyDays: 7, // K-12 `meeting-followup-nanny` +7 d
    trialFollowupNannyDays: 7, // K-15 `trial-followup-nanny` — [unverified]
  }),
  maxPendingRequestsPerParent: 5, // K-1 "≤ config pending per parent" — [unverified]
  minAvailabilitySlots: 5, // K-2 / K-5 "≥ config availability slots" — [unverified]
  meeting: Object.freeze({
    startHourLocal: 8,
    endHourLocal: 20,
    minLeadHours: 12,
  }), // 02 §9 item 22 (Sydney 8 am–8 pm, ≥ 12 h)
  liveStages: Object.freeze(["DRAFT", "OPEN", "CONNECTING", "ACTIVE"] as const), // I-1 one live position per parent
});
