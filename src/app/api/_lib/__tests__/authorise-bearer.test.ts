// RED first (`CODE-CLAUDE.md` §3, TDD): the pre-existing Sydney bug this unit inherits.
//
// Eleven legacy cron routes wrote `if (cronSecret) { …check… }` — when `CRON_SECRET` was **unset** the check was
// skipped entirely and every caller was treated as authorised. 01 §4e states the opposite: a route handler
// "fails closed when the secret is unset". These cases pin that, plus the plain `!==` compare the same routes
// used, which leaks the secret's prefix through timing.
import { describe, expect, it } from "vitest";
import { authoriseBearer } from "../authorise-bearer";

const SECRET = "a-configured-secret";
const header = (value: string) => `Bearer ${value}`;

describe("a missing or empty secret is never authorisation", () => {
  it("rejects when the secret is undefined, even with a well-formed header", () => {
    expect(authoriseBearer(header(SECRET), undefined)).toBe(false);
  });

  it("rejects when the secret is an empty string", () => {
    expect(authoriseBearer(header(""), "")).toBe(false);
  });

  it("rejects when the secret is whitespace only", () => {
    expect(authoriseBearer(header("   "), "   ")).toBe(false);
  });
});

describe("a configured secret is compared in full", () => {
  it("accepts the exact bearer value", () => {
    expect(authoriseBearer(header(SECRET), SECRET)).toBe(true);
  });

  it("rejects a wrong value", () => {
    expect(authoriseBearer(header("wrong"), SECRET)).toBe(false);
  });

  it("rejects a correct prefix — a prefix match must not authorise", () => {
    expect(authoriseBearer(header(SECRET.slice(0, 5)), SECRET)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(authoriseBearer(null, SECRET)).toBe(false);
  });

  it("rejects a header with no Bearer scheme", () => {
    expect(authoriseBearer(SECRET, SECRET)).toBe(false);
  });

  it("rejects a lower-case scheme — the scheme is matched exactly, not guessed", () => {
    expect(authoriseBearer(`bearer ${SECRET}`, SECRET)).toBe(false);
  });

  it("rejects an empty bearer value against a configured secret", () => {
    expect(authoriseBearer(header(""), SECRET)).toBe(false);
  });
});
