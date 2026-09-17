// 04 §8 — the S-X-05 / S-X-06 promise line (D5, ADR-044 level 2; wording "draft, wording deferred" in 04 §8 — used
// as written there, never paraphrased) and the heading it sits under. Every other line on the signup screens
// lives in its component; these two are shared by both screens and read by the copy test, so they live once.
export const SIGNUP_COPY = Object.freeze({
  heading: "We'll connect you with your top nannies",
  promiseLine:
    "Your matchmaker will call to introduce you to your top nannies.",
});
