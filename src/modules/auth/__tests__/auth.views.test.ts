// ADR-129 — the data port reads views as well as tables, and a view is read-only through it. Both halves of the
// ruling as executable claims (ADR-120 rule 1 / ADR-123): (1) `from("nanny_public")` — a view of 02 §7 and the
// prescribed client read of 07 §5.1 rule 4 / §5.2 — answers through `auth.data.run` in both drivers; (2) the
// handle a view gets has no `insert` / `update`, at the type level (`@ts-expect-error`, judged by `tsc`) and at
// run time (the method does not exist), in both drivers. Plus the tuple that decides "view or table" is pinned
// to the generated `Database["public"]["Views"]` keys, so a migration cannot add a view the port mis-classifies.
import { describe, expect, expectTypeOf, it } from "vitest";
import { stubAuth } from "@/modules/auth";
import type { AppDatabase, NamedOperation } from "../types";
import { supabaseQuery } from "../lib/supabase-query";
import { memoryAuthDriver } from "../lib/memory-auth-driver";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VIEW_NAMES } from "@/modules/shared-types";
import type {
  Database,
  Query,
  ViewName,
  ViewQuery,
  TableQuery,
} from "@/modules/shared-types";

const A_PUBLIC_ROW = Object.freeze({
  nanny_id: "22222222-2222-4222-8222-222222222222",
  first_name: "Amara",
  area: "Clapham",
  district: "SW4",
  verification_level: "L3_PROVISIONALLY_VERIFIED",
});

describe("ADR-129 — the port reads a view (half 1)", () => {
  it("answers a select on `nanny_public` through `auth.data.run` (memory driver)", async () => {
    const auth = stubAuth({ tables: { nanny_public: [A_PUBLIC_ROW] } });
    const op: NamedOperation<ReadonlyArray<{ first_name: string | null }>> = {
      name: "matching.loadPublicNannies",
      exec: (q) => q.from("nanny_public").select(),
    };
    const result = await auth.data.run(op);
    expect(result).toEqual({ ok: true, value: [A_PUBLIC_ROW] });
  });

  it("selects `nanny_public` through the Supabase driver as `.from(view).select('*')`", async () => {
    const calls: Array<{ readonly name: string; readonly columns: string }> =
      [];
    const client = {
      from: (name: string) => ({
        select: async (columns: string) => {
          calls.push({ name, columns });
          return { data: [A_PUBLIC_ROW], error: null };
        },
      }),
    } as unknown as SupabaseClient;
    const rows = await supabaseQuery(async () => client)
      .from("nanny_public")
      .select();
    expect(rows).toEqual([A_PUBLIC_ROW]);
    expect(calls).toEqual([{ name: "nanny_public", columns: "*" }]);
  });

  it("types a view's rows as the generated view Row, and a table's as the table Row", () => {
    type Q = Query<AppDatabase>;
    expectTypeOf<ReturnType<Q["from"]>>().not.toBeNever();
    expectTypeOf<
      Awaited<ReturnType<ViewQuery<AppDatabase, "nanny_public">["select"]>>
    >().toEqualTypeOf<
      ReadonlyArray<Database["public"]["Views"]["nanny_public"]["Row"]>
    >();
    expectTypeOf<
      Awaited<ReturnType<TableQuery<AppDatabase, "areas">["select"]>>
    >().toEqualTypeOf<
      ReadonlyArray<Database["public"]["Tables"]["areas"]["Row"]>
    >();
  });
});

describe("ADR-129 — a view is read-only through the port (half 2)", () => {
  it("gives a view no `insert` / `update` at run time — memory driver", () => {
    const q = memoryAuthDriver({ tables: { nanny_public: [] } }).query(
      "session",
    );
    const view: object = q.from("nanny_public");
    const table: object = q.from("areas");
    expect(Object.keys(view)).toEqual(["select"]);
    expect(Object.keys(table).sort()).toEqual(["insert", "select", "update"]);
  });

  it("gives a view no `insert` / `update` at run time — Supabase driver", () => {
    const q = supabaseQuery(async () => ({}) as unknown as SupabaseClient);
    const view: object = q.from("nanny_public");
    const table: object = q.from("areas");
    expect(Object.keys(view)).toEqual(["select"]);
    expect(Object.keys(table).sort()).toEqual(["insert", "select", "update"]);
  });

  it("forbids `insert` / `update` on a view at the type level (tsc judges)", () => {
    const q = memoryAuthDriver().query("session");
    const view = q.from("nanny_public");
    // @ts-expect-error — ADR-129: no insert through `from()` on a view
    expect(view.insert).toBeUndefined();
    // @ts-expect-error — ADR-129: no update through `from()` on a view
    expect(view.update).toBeUndefined();
    expectTypeOf(q.from("areas")).toHaveProperty("insert");
    expectTypeOf(q.from("areas")).toHaveProperty("update");
  });
});

describe("ADR-129 — the view tuple is the schema's (02 §7: nine views)", () => {
  it("names exactly the generated `Views` keys, in both directions", () => {
    expectTypeOf<(typeof VIEW_NAMES)[number]>().toEqualTypeOf<
      ViewName<AppDatabase>
    >();
    expect(VIEW_NAMES).toHaveLength(9);
    expect([...VIEW_NAMES]).toEqual([...VIEW_NAMES].sort());
  });
});
