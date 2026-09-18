// The one piece of machinery ADR-165 (3)'s tests share: a twin's body without its own transaction control.
//
// H-3 (REVIEW-4) wrote it inside `rollback-security-clauses.test.ts` for `0023`. `0025` needs the same thing,
// so it lives here rather than being written twice — a second copy is how the two drift, and a twin harness
// that drifts is a twin harness nobody trusts.
//
// Why it is needed: an ADR-165 (3) suite runs inside one transaction it rolls back, because Postgres makes DDL
// transactional and a twin's `drop` / `create or replace` must not outlive the test. But a twin owns its own
// `begin;` / `commit;`, which would end the suite's transaction and make the rollback permanent. So those two
// lines are stripped — and only those two: `removed` is asserted by each caller, so a twin that grows a second
// pair fails loudly rather than half-running.
import { readFileSync } from "node:fs";

export type StrippedTwin = {
  readonly sql: string;
  readonly removed: number;
};

/**
 * Only a `begin;` or `commit;` that is the whole line is removed — a `begin` inside a `plpgsql` body is
 * indented and followed by declarations, and must survive.
 */
export function bodyOf(path: string): StrippedTwin {
  const lines = readFileSync(path, "utf8").split("\n");
  const kept = lines.filter((line) => !/^(begin|commit);\s*$/i.test(line));
  return { sql: kept.join("\n"), removed: lines.length - kept.length };
}
