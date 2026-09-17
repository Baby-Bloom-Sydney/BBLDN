// A hand-rolled `Auth` for the `scheduling` inside: the narrow `Query` of 03 §1.4 over in-memory tables, plus a
// recording `rpc`. It is deliberately **not** `stubAuth`, for two reasons — `memoryAuthDriver.rpc` answers
// `undefined` (so `book_slot()` could not be reached at all), and the claim this unit's merge rests on is what
// the module *sends* to `book_slot()`, which only a recording double can assert.
//
// The function's own behaviour is `0009`'s and was verified there (S5, `int.rpc-0017`'s sibling suites); what
// is unverified until now is that displacement is **one** RPC carrying the right `p_displace_to` (ADR-127).
import type { Auth } from "@/modules/auth";
import { err, ok } from "@/modules/platform";

type Row = Record<string, unknown>;

export type FakePort = {
  readonly auth: Auth;
  readonly rows: Map<string, Array<Row>>;
  readonly rpcCalls: Array<{ readonly name: string; readonly args: Row }>;
  /** what the next `rpc` answers; a `throw` here is how a raise from `0009` reaches the module */
  rpcAnswer: (name: string, args: Row) => unknown;
  readonly names: Array<string>;
};

export function fakeSchedulingPort(options: {
  readonly tables: Readonly<Record<string, ReadonlyArray<Row>>>;
  readonly admin?: boolean;
}): FakePort {
  const rows = new Map<string, Array<Row>>(
    Object.entries(options.tables).map(([table, list]) => [
      table,
      list.map((row) => ({ ...row })),
    ]),
  );
  const rpcCalls: Array<{ name: string; args: Row }> = [];
  const names: Array<string> = [];
  // Mutated in place and returned as-is: a spread copy would leave `rpcAnswer` reassignments invisible to the
  // closure below, and a test that set one would silently get the default.
  const port = {
    rows,
    rpcCalls,
    names,
    rpcAnswer: (_name: string, _args: Row): unknown => ({
      booking: null,
      displaced: null,
      replayed: false,
    }),
    auth: null as unknown as Auth,
  };

  const listOf = (table: string): Array<Row> => {
    const list = rows.get(table) ?? [];
    rows.set(table, list);
    return list;
  };

  const handle = (table: string) => ({
    select: async () => listOf(table).map((row) => ({ ...row })),
    insert: async (row: Row) => {
      const written = {
        id: `${table}-${String(listOf(table).length + 1)}`,
        ...row,
      };
      listOf(table).push(written);
      return { ...written };
    },
    update: async (id: string, patch: Row) => {
      const list = listOf(table);
      const at = list.findIndex((row) => row.id === id);
      if (at < 0) throw new Error("update matched no row");
      const next = { ...list[at], ...patch };
      list[at] = next;
      return { ...next };
    },
    eq: (column: string, value: unknown) => {
      const matching = () =>
        listOf(table).filter((row) => row[column] === value);
      return {
        select: async () => matching().map((row) => ({ ...row })),
        single: async () => {
          const found = matching();
          if (found.length > 1) throw new Error("keyed read matched two rows");
          return found.length === 0 ? null : { ...found[0] };
        },
      };
    },
  });

  const query = {
    from: (table: string) => handle(table),
    rpc: async (name: string, args: Row) => {
      rpcCalls.push({ name, args });
      return port.rpcAnswer(name, args);
    },
  };

  const auth = {
    requireRole: async () =>
      options.admin === false
        ? err("FORBIDDEN", "Not an admin", { reason: "role" as const })
        : ok({
            userId: "admin-user",
            role: "admin" as const,
            mfaVerified: true,
            expiresAt: "2099-01-01T00:00:00.000Z",
          }),
    data: {
      run: async (op: {
        readonly name: string;
        readonly exec: (q: unknown) => Promise<unknown>;
      }) => {
        names.push(op.name);
        try {
          return ok(await op.exec(query));
        } catch (thrown) {
          return err("INTERNAL", (thrown as Error).message);
        }
      },
    },
  };

  port.auth = auth as unknown as Auth;
  return port;
}
