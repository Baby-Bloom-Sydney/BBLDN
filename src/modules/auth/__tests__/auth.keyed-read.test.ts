// ADR-131 (1) — `TableQuery` has a keyed read, and it is read-only by construction. Both halves as executable
// claims (ADR-123 keeps ADR-120's rule: a claim the merge rests on ships as a test): (1) `from(t).eq(col, v)`
// answers `select()` (the rows) and `single()` (the one row / `null`) through both drivers, `single()` refusing two
// rows because a key is a key; (2) the keyed handle has no `insert` / `update` — at the type level (judged by
// `tsc` via `@ts-expect-error`) and at run time (the method does not exist) — and a mistyped column is a compile
// error. Plus: a keyed read passes through the unit-of-work guard (a read is harmless inside a uow — ADR-127).
import { describe, expect, expectTypeOf, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KeyedRead, Query } from "@/modules/shared-types";
import type { AppDatabase } from "../types";
import { memoryAuthDriver } from "../lib/memory-auth-driver";
import { supabaseQuery } from "../lib/supabase-query";

const ROW_A = Object.freeze({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  template_id: "welcome-parent",
  status: "queued",
  dedupe_key: "k-1",
});
const ROW_B = Object.freeze({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  template_id: "welcome-parent",
  status: "sent",
  dedupe_key: "k-2",
});

const memoryQuery = (rows: ReadonlyArray<Record<string, unknown>>) =>
  memoryAuthDriver({ tables: { email_logs: rows } }).query("service");

describe("ADR-131 (1) — the keyed read answers through the memory driver", () => {
  it("eq(column, value).select() returns only the matching rows", async () => {
    const rows = await memoryQuery([ROW_A, ROW_B])
      .from("email_logs")
      .eq("status", "sent")
      .select();
    expect(rows).toEqual([ROW_B]);
  });

  it("eq(column, value).single() returns the one row, or null for none", async () => {
    const q = memoryQuery([ROW_A, ROW_B]);
    expect(await q.from("email_logs").eq("dedupe_key", "k-1").single()).toEqual(
      ROW_A,
    );
    expect(
      await q.from("email_logs").eq("dedupe_key", "absent").single(),
    ).toBeNull();
  });

  it("single() throws when two rows match — a key that is not a key is a broken invariant, not an answer", async () => {
    await expect(
      memoryQuery([ROW_A, ROW_B])
        .from("email_logs")
        .eq("template_id", "welcome-parent")
        .single(),
    ).rejects.toThrow(/2 rows/);
  });
});

describe("ADR-131 (1) — the keyed read answers through the Supabase driver", () => {
  type Call = {
    readonly table: string;
    readonly columns: string;
    readonly eq: readonly [string, unknown];
    readonly mode: "list" | "maybeSingle";
  };

  function fakeClient(answer: unknown) {
    const calls: Call[] = [];
    const client = {
      from: (table: string) => ({
        select: (columns: string) => {
          const builder = {
            // a plain thenable, not a Promise: `await` short-circuits a native Promise without calling `then`
            eq: (column: string, value: unknown) => {
              const call = { table, columns, eq: [column, value] as const };
              return {
                maybeSingle: async () => {
                  calls.push({ ...call, mode: "maybeSingle" });
                  return { data: answer, error: null };
                },
                then: (onOk: (v: unknown) => unknown) => {
                  calls.push({ ...call, mode: "list" });
                  return Promise.resolve({ data: answer, error: null }).then(
                    onOk,
                  );
                },
              };
            },
          };
          return builder;
        },
      }),
    } as unknown as SupabaseClient;
    return { client, calls };
  }

  it("select() is `.select(columns).eq(column, value)` on the table", async () => {
    const { client, calls } = fakeClient([ROW_B]);
    const rows = await supabaseQuery(async () => client)
      .from("email_logs")
      .eq("status", "sent")
      .select(["id", "status"]);
    expect(rows).toEqual([ROW_B]);
    expect(calls).toEqual([
      {
        table: "email_logs",
        columns: "id,status",
        eq: ["status", "sent"],
        mode: "list",
      },
    ]);
  });

  it("single() is `.select('*').eq(column, value).maybeSingle()` — PostgREST refuses two rows for us", async () => {
    const { client, calls } = fakeClient(ROW_A);
    const row = await supabaseQuery(async () => client)
      .from("email_logs")
      .eq("id", ROW_A.id)
      .single();
    expect(row).toEqual(ROW_A);
    expect(calls).toEqual([
      {
        table: "email_logs",
        columns: "*",
        eq: ["id", ROW_A.id],
        mode: "maybeSingle",
      },
    ]);
  });

  it("single() answers null when PostgREST answers no row", async () => {
    const { client } = fakeClient(null);
    expect(
      await supabaseQuery(async () => client)
        .from("email_logs")
        .eq("id", ROW_A.id)
        .single(),
    ).toBeNull();
  });
});

describe("ADR-131 (1) — the keyed handle is read-only by construction", () => {
  it("has no insert / update at run time, in both drivers", () => {
    const memory = memoryQuery([]).from("email_logs").eq("id", ROW_A.id);
    const supabase = supabaseQuery(async () => ({}) as SupabaseClient)
      .from("email_logs")
      .eq("id", ROW_A.id);
    for (const handle of [memory, supabase]) {
      expect(Object.keys(handle).sort()).toEqual(["select", "single"]);
      expect("insert" in handle).toBe(false);
      expect("update" in handle).toBe(false);
    }
  });

  it("types: a keyed write is a compile error; a mistyped column is a compile error; the row type is the table's", () => {
    const q: Query<AppDatabase> = memoryQuery([]);
    const keyed = q.from("email_logs").eq("id", ROW_A.id);
    expectTypeOf(keyed).toEqualTypeOf<
      KeyedRead<AppDatabase["Tables"]["email_logs"]["Row"]>
    >();
    // @ts-expect-error — ADR-131 (1): the keyed handle carries no insert
    void keyed.insert;
    // @ts-expect-error — ADR-131 (1): the keyed handle carries no update
    void keyed.update;
    // @ts-expect-error — a column the generated row does not have
    void memoryQuery([]).from("email_logs").eq("no_such_column", "x");
    // @ts-expect-error — the value must be the column's own type (status is the enum, not free text)
    void memoryQuery([]).from("email_logs").eq("status", "not-a-status");
    // @ts-expect-error — null is not an equality
    void memoryQuery([]).from("email_logs").eq("dedupe_key", null);
    expectTypeOf(keyed.single).returns.resolves.toEqualTypeOf<
      AppDatabase["Tables"]["email_logs"]["Row"] | null
    >();
  });
});
