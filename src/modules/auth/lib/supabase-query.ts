// The narrow `Query` surface of 03 §1.4 over a Supabase client — a typed table + RPC handle, no raw client and no
// admin method. A driver error is **thrown** here on purpose: `DataAccessPort.run` is the one place it becomes an
// `INTERNAL` `Result`, so no call site can forget to check (01 §4a rule 1).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Query } from "@/modules/shared-types";
import type { AppDatabase } from "../types";

type Rows = ReadonlyArray<Readonly<Record<string, unknown>>>;
type DriverResult = { data: unknown; error: { message: string } | null };

/** An RPC may legitimately return `null`, so this one only refuses a reported error. */
const unwrap = <T>(result: DriverResult): T => {
  if (result.error !== null) throw new Error(result.error.message);
  return result.data as T;
};

/** A successful `select` is a list. Anything else is a shape we cannot honour — fail at the seam, not downstream. */
const unwrapRows = (result: DriverResult): Rows => {
  const data = unwrap<unknown>(result);
  if (!Array.isArray(data)) throw new Error("select returned no rows");
  return data as Rows;
};

/** A successful `insert` / `update` returns the row it wrote; `null` there is a driver anomaly, not an empty answer. */
const unwrapRow = <T>(result: DriverResult): T => {
  const data = unwrap<unknown>(result);
  if (data === null || data === undefined)
    throw new Error("write returned no row");
  return data as T;
};

export function supabaseQuery(
  client: () => Promise<SupabaseClient>,
): Query<AppDatabase> {
  return {
    from: (table) => ({
      select: async (columns) =>
        unwrapRows(
          await (await client())
            .from(table)
            .select(columns === undefined ? "*" : columns.join(",")),
        ),
      insert: async (row) =>
        unwrapRow(
          await (
            await client()
          )
            .from(table)
            .insert(row as Record<string, unknown>)
            .select()
            .single(),
        ),
      update: async (id, patch) =>
        unwrapRow(
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
