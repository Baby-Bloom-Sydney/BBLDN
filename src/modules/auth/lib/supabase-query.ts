// The narrow `Query` surface of 03 §1.4 over a Supabase client — a typed table + RPC handle, no raw client and no
// admin method. A driver error is **thrown** here on purpose: `DataAccessPort.run` is the one place it becomes an
// `INTERNAL` `Result`, so no call site can forget to check (01 §4a rule 1).
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Query,
  TableName,
  TableQuery,
  TableRow,
} from "@/modules/shared-types";
import type { AppDatabase } from "../types";

type DriverResult = { data: unknown; error: { message: string } | null };

/** An RPC may legitimately return `null`, so this one only refuses a reported error. */
const unwrap = <T>(result: DriverResult): T => {
  if (result.error !== null) throw new Error(result.error.message);
  return result.data as T;
};

/**
 * A successful `select` is a list. Anything else is a shape we cannot honour — fail at the seam, not downstream.
 *
 * The `as` is the **one** place in the module where a driver payload becomes a generated row type, and it is
 * unavoidable: PostgREST answers with JSON, so the only alternative is a runtime validator per table, which would
 * duplicate `database.types.ts` by hand — the thing 01 §6.2 exists to prevent. S4 removed nine scattered
 * `as never` casts precisely so this would land in one documented place instead of nine undocumented ones, and
 * so that a mistyped **table or column name** still fails at compile time, which it does: `T` is constrained to
 * `TableName<AppDatabase>` and the generated types are what `T` indexes into.
 */
const unwrapRows = <R>(result: DriverResult): ReadonlyArray<R> => {
  const data = unwrap<unknown>(result);
  if (!Array.isArray(data)) throw new Error("select returned no rows");
  return data as ReadonlyArray<R>;
};

/** A successful `insert` / `update` returns the row it wrote; `null` there is a driver anomaly, not an empty answer. */
const unwrapRow = <R>(result: DriverResult): R => {
  const data = unwrap<unknown>(result);
  if (data === null || data === undefined)
    throw new Error("write returned no row");
  return data as R;
};

export function supabaseQuery(
  client: () => Promise<SupabaseClient>,
): Query<AppDatabase> {
  return {
    from: <T extends TableName<AppDatabase>>(
      table: T,
    ): TableQuery<AppDatabase, T> => ({
      select: async (columns) =>
        unwrapRows<TableRow<AppDatabase, T>>(
          await (await client())
            .from(table)
            .select(columns === undefined ? "*" : columns.join(",")),
        ),
      insert: async (row) =>
        unwrapRow<TableRow<AppDatabase, T>>(
          await (
            await client()
          )
            .from(table)
            .insert(row as Record<string, unknown>)
            .select()
            .single(),
        ),
      update: async (id, patch) =>
        unwrapRow<TableRow<AppDatabase, T>>(
          await (
            await client()
          )
            .from(table)
            .update(patch as Record<string, unknown>)
            .eq("id", id)
            .select()
            .single(),
        ),
    }),
    rpc: async (name, args) =>
      unwrap(await (await client()).rpc(name, args as Record<string, unknown>)),
  };
}
