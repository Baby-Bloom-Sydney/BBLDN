// The narrow `Query` surface of 03 §1.4 over a Supabase client — a typed table + RPC handle, no raw client and no
// admin method. A driver error is **thrown** here on purpose: `DataAccessPort.run` is the one place it becomes an
// `INTERNAL` `Result`, so no call site can forget to check (01 §4a rule 1).
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  KeyedRead,
  Query,
  QueryHandle,
  ReadableName,
  RowOf,
} from "@/modules/shared-types";
import type { AppDatabase } from "../types";
import { isViewName } from "./is-view-name";

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
 * `ReadableName<AppDatabase>` and the generated types are what `N` indexes into (ADR-129: tables and views).
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
 * where "a key matched two rows" becomes a thrown driver error rather than an arbitrary first row. It is built
 * for a **name**, not a table (ADR-129): a view is keyed-readable too, and read-only either way — `KeyedRead`
 * carries no `insert` / `update` to omit.
 */
function keyedRead<N extends ReadableName<AppDatabase>>(
  client: () => Promise<SupabaseClient>,
  name: N,
  column: string,
  value: unknown,
): KeyedRead<RowOf<AppDatabase, N>> {
  return {
    select: async (columns) =>
      unwrapRows<RowOf<AppDatabase, N>>(
        await (await client())
          .from(name)
          .select(columnList(columns))
          .eq(column, value),
      ),
    single: async () =>
      unwrapMaybeRow<RowOf<AppDatabase, N>>(
        await (await client())
          .from(name)
          .select("*")
          .eq(column, value)
          .maybeSingle(),
      ),
  };
}

export function supabaseQuery(
  client: () => Promise<SupabaseClient>,
): Query<AppDatabase> {
  const select = async <N extends ReadableName<AppDatabase>>(
    name: N,
    columns: ReadonlyArray<string> | undefined,
  ): Promise<ReadonlyArray<RowOf<AppDatabase, N>>> =>
    unwrapRows<RowOf<AppDatabase, N>>(
      await (await client()).from(name).select(columnList(columns)),
    );

  // ADR-129 / ADR-131 (1): a view's handle carries reads only — `select` and the keyed `eq`. The `as` on the return is the same single seam as the row
  // casts above — `QueryHandle` is a conditional type over the name, which an object literal cannot satisfy
  // without one; the table / view split itself is decided by `isViewName`, never by the caller.
  const from = <N extends ReadableName<AppDatabase>>(
    name: N,
  ): QueryHandle<AppDatabase, N> => {
    const eq = (column: string, value: unknown) =>
      keyedRead(client, name, column, value);
    if (isViewName(name)) {
      return {
        select: (columns?: ReadonlyArray<string>) => select(name, columns),
        eq,
      } as unknown as QueryHandle<AppDatabase, N>;
    }
    return {
      select: (columns?: ReadonlyArray<string>) => select(name, columns),
      eq,
      insert: async (row: Readonly<Record<string, unknown>>) =>
        unwrapRow<RowOf<AppDatabase, N>>(
          await (await client()).from(name).insert(row).select().single(),
        ),
      update: async (id: string, patch: Readonly<Record<string, unknown>>) =>
        unwrapRow<RowOf<AppDatabase, N>>(
          await (await client())
            .from(name)
            .update(patch)
            .eq("id", id)
            .select()
            .single(),
        ),
    } as unknown as QueryHandle<AppDatabase, N>;
  };

  return {
    from,
    rpc: async (name, args) =>
      unwrap(await (await client()).rpc(name, args as Record<string, unknown>)),
  };
}
