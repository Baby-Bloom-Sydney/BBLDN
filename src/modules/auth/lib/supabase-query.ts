// The narrow `Query` surface of 03 §1.4 over a Supabase client — a typed table + RPC handle, no raw client and no
// admin method. A driver error is **thrown** here on purpose: `DataAccessPort.run` is the one place it becomes an
// `INTERNAL` `Result`, so no call site can forget to check (01 §4a rule 1).
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  KeyedRead,
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

/** A keyed `single()` legitimately answers `null` (no such row); two rows are PostgREST's error (`maybeSingle`). */
const unwrapMaybeRow = <R>(result: DriverResult): R | null => {
  const data = unwrap<unknown>(result);
  return data === null || data === undefined ? null : (data as R);
};

const columnList = (columns: ReadonlyArray<string> | undefined): string =>
  columns === undefined ? "*" : columns.join(",");

/**
 * ADR-131 (1): the keyed read is `.select(columns).eq(column, value)`; `single()` adds `.maybeSingle()`, which is
 * where "a key matched two rows" becomes a thrown driver error rather than an arbitrary first row.
 */
function keyedRead<T extends TableName<AppDatabase>>(
  client: () => Promise<SupabaseClient>,
  table: T,
  column: string,
  value: unknown,
): KeyedRead<TableRow<AppDatabase, T>> {
  return {
    select: async (columns) =>
      unwrapRows<TableRow<AppDatabase, T>>(
        await (await client())
          .from(table)
          .select(columnList(columns))
          .eq(column, value),
      ),
    single: async () =>
      unwrapMaybeRow<TableRow<AppDatabase, T>>(
        await (await client())
          .from(table)
          .select("*")
          .eq(column, value)
          .maybeSingle(),
      ),
  };
}

export function supabaseQuery(
  client: () => Promise<SupabaseClient>,
): Query<AppDatabase> {
  return {
    from: <T extends TableName<AppDatabase>>(
      table: T,
    ): TableQuery<AppDatabase, T> => ({
      select: async (columns) =>
        unwrapRows<TableRow<AppDatabase, T>>(
          await (await client()).from(table).select(columnList(columns)),
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
      eq: (column, value) => keyedRead(client, table, column, value),
    }),
    rpc: async (name, args) =>
      unwrap(await (await client()).rpc(name, args as Record<string, unknown>)),
  };
}
