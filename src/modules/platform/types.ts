// platform — the module's type surface (01 §2.5). The sub-modules named in the map (01 §2.5: `platform/log` ·
// `platform/events` · `platform/consent`) keep their own `types.ts`; this file re-exports them plus the Result /
// envelope / unit-of-work types that live at the module root. Values live in index.ts.
import type {
  AppErrorDetails,
  ClientAppError,
  Result,
  UnitOfWork,
  WithUnitOfWork,
} from "@/modules/shared-types";

export type * from "./log/types";
export type * from "./events/types";
export type * from "./consent/types";
export type * from "./rate-limit/types";
export type * from "./upload-scan/types";

// ── Result helpers (01 §4a) ──

/** A `Result` whose error has already crossed the boundary: `cause` stripped (01 §4a "serialisable"). */
export type ClientResult<T, D extends AppErrorDetails = AppErrorDetails> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ClientAppError<D> };

/** What `fromThrown` attaches so an `INTERNAL` error still says where it came from — never the thrown text. */
export type ThrownContext = {
  readonly module?: string;
  readonly action?: string;
  readonly requestId?: string;
};

// ── API envelope (01 §4c) ──

export type PageMeta = {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
};

export type SuccessEnvelope<T> = {
  readonly data: T;
  readonly meta?: PageMeta;
  readonly requestId: string;
};

export type ErrorEnvelope<D extends AppErrorDetails = AppErrorDetails> = {
  readonly error: ClientAppError<D>;
  readonly requestId: string;
};

export type Envelope<T, D extends AppErrorDetails = AppErrorDetails> =
  | SuccessEnvelope<T>
  | ErrorEnvelope<D>;

/** 01 §4c rule 1: `200` reads / updates · `201` create · `204` delete. */
export type SuccessStatus = 200 | 201 | 204;
/** 01 §4a table, HTTP column. */
export type ErrorStatus = 401 | 403 | 404 | 422 | 409 | 429 | 502 | 500;

export type EnvelopeOptions = {
  /** From the middleware (`x-vercel-id` or a uuid — 01 §4b); a route without one gets a fresh uuid. */
  readonly requestId: string;
  readonly status?: SuccessStatus;
  readonly meta?: PageMeta;
};

/** The pure half of `toResponse`: body + status + headers, no `Response` object (testable, framework-free). */
export type EnvelopePayload<T, D extends AppErrorDetails = AppErrorDetails> = {
  readonly status: SuccessStatus | ErrorStatus;
  readonly body: Envelope<T, D> | null;
  readonly headers: Readonly<Record<string, string>>;
};

// ── Unit of work (01 §6.3; 03 §1.4) ──

/**
 * The port `auth` (S4) implements over its data client: begin / commit / rollback on an opaque handle `H`.
 * `platform` never sees a driver type — it only carries `H` from `begin` to `commit` / `rollback` and hands it
 * back to the owner through `transactionOf` (see `UnitOfWorkBinding`).
 */
export type TransactionOpener<H> = {
  begin(): Promise<Result<H>>;
  commit(handle: H): Promise<Result<void>>;
  rollback(handle: H): Promise<Result<void>>;
};

/**
 * What `createUnitOfWork(opener)` returns: the `withUnitOfWork` of 03 §1.4 (commit on ok, roll back on error /
 * throw; nested calls join the outer) and `transactionOf`, the one way the opener's owner gets its handle back for
 * a token a caller passed as `{ uow }` — typed by the same `H` it minted, so no cast crosses a connector.
 */
export type UnitOfWorkBinding<H> = {
  readonly withUnitOfWork: WithUnitOfWork;
  readonly transactionOf: (uow: UnitOfWork) => H | undefined;
  /** The token of the unit of work the current async context is inside, if any (nested-call join). */
  readonly current: () => UnitOfWork | undefined;
};

/** How a memory opener reports what happened — the stub's observable state for the swap tests. */
export type MemoryTransactionState = "open" | "committed" | "rolled-back";
export type MemoryTransaction = {
  readonly id: number;
  readonly state: MemoryTransactionState;
};
