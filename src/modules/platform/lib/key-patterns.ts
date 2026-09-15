// The field-name vocabulary both redaction boundaries read, split into the two classes that behave differently
// (01 §4b never-logged list; 07 §2.7(a) / §9.2). Keys are matched after `normaliseKey`; the trailing `(e?s)?`
// is load-bearing — without it the `($|_)` boundary broke on every plural (`apiKeys`, `tokens`, `addresses`).
//
// - `secret` — credentials and raw payloads. Never in a log, and **never** back to a client: nothing a caller
//   sent us under one of these names is theirs to be told again, whatever the value looks like.
// - `personal` — the requester's own personal data. Never in a log, but legitimately *named* in a client
//   `details` (01 §4c's own example is `details: { mobile: ["UK mobile required"] }`), so the client-error guard
//   leaves these keys alone and judges them by value.
// - `safe` — ids and names of *things*, which would otherwise collide with `name` / `key` / `body`.
//
// The log scrubber redacts `secret | personal`; `safeDetails` redacts `secret` only.
export const KEY_PATTERNS = Object.freeze({
  secret:
    /(^|_)(token|secret|password|passwd|authorization|cookie|body|document[a-z_]*|api_key|private_key)(e?s)?($|_)/,
  personal:
    /(^|_)(e_?mail|phone|mobile|contact_number|address|name|first_name|last_name|full_name|display_name|surname|given_name|ip|user_agent|session_id)(e?s)?($|_)/,
  safe: /^(request_id|idempotency_key|event_name|template_id|module|action|bucket_key|sink_id|retention_row|scrubbed_tables)$/,
});
