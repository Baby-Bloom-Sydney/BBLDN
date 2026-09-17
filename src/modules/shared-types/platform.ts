// 03 §1.4 — the `platform` unit of work and the narrow data surface (copied as types; the inside is S3 / S4).
import type { Result } from "./result";
import type { Instant, Uuid } from "./scalars";

declare const UowBrand: unique symbol;
/** Opaque transaction token minted by `platform.withUnitOfWork`; no driver type crosses a connector (R4). */
export type UnitOfWork = { readonly [UowBrand]: true };

export type WithUnitOfWork = <T>(
  fn: (uow: UnitOfWork) => Promise<Result<T>>,
) => Promise<Result<T>>;

/** Every webhook body (03 §5.2 `handleWebhook`). */
export type RawProviderEvent = {
  readonly rawBody: string;
  readonly signature: string;
  readonly receivedAt: Instant;
};

/**
 * The structural shape `supabase gen types` emits for one schema (01 §6.2). `database.types.ts` (S5) supplies the
 * concrete `Database["public"]`; until then `Query` is generic over this shape so no hand-written table type exists.
 */
export type DatabaseShape = {
  readonly Tables: Readonly<
    Record<
      string,
      {
        readonly Row: Readonly<Record<string, unknown>>;
        readonly Insert: Readonly<Record<string, unknown>>;
        readonly Update: Readonly<Record<string, unknown>>;
      }
    >
  >;
  readonly Functions: Readonly<
    Record<string, { readonly Args: unknown; readonly Returns: unknown }>
  >;
};

export type TableName<DB extends DatabaseShape> = keyof DB["Tables"] & string;
export type RpcName<DB extends DatabaseShape> = keyof DB["Functions"] & string;
export type RpcArgs<
  DB extends DatabaseShape,
  N extends RpcName<DB>,
> = DB["Functions"][N]["Args"];
export type RpcResult<
  DB extends DatabaseShape,
  N extends RpcName<DB>,
> = DB["Functions"][N]["Returns"];
export type TableRow<
  DB extends DatabaseShape,
  T extends TableName<DB>,
> = DB["Tables"][T]["Row"];

/**
 * ADR-131 (1) — the keyed read: `from(name).eq(column, value)` narrows to the rows where one column equals one
 * value, then `select()` (the rows) or `single()` (the one row, `null` for none). It is **read-only by
 * construction** — there is no `insert` / `update` on this handle, so a keyed write is a compile error whatever
 * name it was reached through (a view's handle stays select-only under ADR-129). `single()` is a *key* read: two
 * matching rows are a broken invariant and throw at the seam, which the port maps to `INTERNAL`; a caller that
 * wants "the newest of several" uses `select()` and says so.
 */
export interface KeyedRead<Row> {
  select(
    columns?: ReadonlyArray<keyof Row & string>,
  ): Promise<ReadonlyArray<Row>>;
  single(): Promise<Row | null>;
}

/** The value a keyed read may be given: the column's own type, never `null` (`IS NULL` is not an equality). */
export type KeyValue<Row, C extends keyof Row> = Exclude<Row[C], null>;

/** A typed table query handle — the narrow surface `auth`'s port hands a `NamedOperation` (03 §1.4). */
export interface TableQuery<DB extends DatabaseShape, T extends TableName<DB>> {
  select(
    columns?: ReadonlyArray<keyof TableRow<DB, T> & string>,
  ): Promise<ReadonlyArray<TableRow<DB, T>>>;
  insert(row: DB["Tables"][T]["Insert"]): Promise<TableRow<DB, T>>;
  update(id: Uuid, patch: DB["Tables"][T]["Update"]): Promise<TableRow<DB, T>>;
  /** ADR-131 (1): one equality predicate on one typed column; the handle it returns is read-only. */
  eq<C extends keyof TableRow<DB, T> & string>(
    column: C,
    value: KeyValue<TableRow<DB, T>, C>,
  ): KeyedRead<TableRow<DB, T>>;
}

/**
 * Typed table + RPC access over the generated DB types, scoped by the port; no raw client, no admin methods.
 * No default for `DB` on purpose: every call site names its shape, so the S5 switch to `Database["public"]`
 * surfaces each one. `exec(q): Promise<T>` throws on a driver error and the port maps it to `INTERNAL` (03 §1.4).
 */
export interface Query<DB extends DatabaseShape> {
  from<T extends TableName<DB>>(table: T): TableQuery<DB, T>;
  rpc<N extends RpcName<DB>>(
    name: N,
    args: RpcArgs<DB, N>,
  ): Promise<RpcResult<DB, N>>;
}
