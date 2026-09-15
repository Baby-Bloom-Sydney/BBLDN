// 03 §1.4 — the `platform` unit of work and the narrow data surface (copied as types; the inside is S3 / S4).
import type { Result } from "./result";
import type { Instant } from "./scalars";

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

/** A typed table query handle — the narrow surface `auth`'s port hands a `NamedOperation` (03 §1.4). */
export interface TableQuery<DB extends DatabaseShape, T extends TableName<DB>> {
  select(
    columns?: ReadonlyArray<keyof TableRow<DB, T> & string>,
  ): Promise<ReadonlyArray<TableRow<DB, T>>>;
  insert(row: DB["Tables"][T]["Insert"]): Promise<TableRow<DB, T>>;
  update(
    id: string,
    patch: DB["Tables"][T]["Update"],
  ): Promise<TableRow<DB, T>>;
}

/** Typed table + RPC access over the generated DB types, scoped by the port; no raw client, no admin methods. */
export interface Query<DB extends DatabaseShape = DatabaseShape> {
  from<T extends TableName<DB>>(table: T): TableQuery<DB, T>;
  rpc<N extends RpcName<DB>>(
    name: N,
    args: RpcArgs<DB, N>,
  ): Promise<RpcResult<DB, N>>;
}
