// comms/sms — the swappable slot of 03 §8 (N-11, ADR-063). The slot exists so that returning SMS changes one
// binding and one template's `channel`, and no business module at all.
export type SmsProviderId = "null-sms";
