// The two marks every scrubber writes (01 §4b; 07 §9.2). One file so the log scrubber, the message scrubber and
// the client-error guard cannot drift apart — the runbook's log queries match on these strings.
export const REDACTION_MARKS = Object.freeze({
  redacted: "[redacted]",
  truncated: "[truncated]",
});
