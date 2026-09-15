// 01 §3.1 — the email domain that marks test users (excluded from analytics, pixel / CAPI and the pipeline
// snapshot; 03 §9.5). 06 §2.3: seeded users live on `@example.test`. 01 §3.1 says "value from env in preview /
// prod" but 06 §2.5 names no env var for it — a code value until that name exists (06 §13 O-7 reconciles the two
// mechanisms; `user_profiles.is_test_user` is authoritative).
export const TEST_USER_DOMAIN = "example.test";
