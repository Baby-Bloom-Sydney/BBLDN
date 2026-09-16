// The narrow `Query` surface of 03 §1.4 over a Supabase client — a typed table + RPC handle, no raw client and no
// admin method. A driver error is **thrown** here on purpose: `DataAccessPort.run` is the one place it becomes an
// `INTERNAL` `Result`, so no call site can forget to check (01 §4a rule 1).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Query } from "@/modules/shared-types";
import type { AppDatabase } from "../types";

type Rows = ReadonlyArray<Readonly<Record<string, unknown>>>;

const unwrap = <T>(result: {
  data: unknown;
  error: { message: string } | null;
}): T => {
  if (result.error !== null) throw new Error(result.error.message);
  return result.data as T;
};

export function supabaseQuery(
  client: () => Promise<SupabaseClient>,
): Query<AppDatabase> {
  return {
    from: (table) => ({
      select: async (columns) =>
        unwrap<Rows>(
          await (await client())
            .from(table)
            .select(columns === undefined ? "*" : columns.join(",")),
        ) as never,
      insert: async (row) =>
        unwrap(
          await (
            await client()
          )
            .from(table)
            .insert(row as never)
            .select()
            .single(),
        ),
      update: async (id, patch) =>
        unwrap(
          await (
            await client()
          )
            .from(table)
            .update(patch as never)
            .eq("id", id)
            .select()
            .single(),
        ),
    }),
    rpc: async (name, args) =>
      unwrap(await (await client()).rpc(name, args as never)),
  };
}
