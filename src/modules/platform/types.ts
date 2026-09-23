// platform — the module's type surface (01 §2.5). The sub-modules named in the map (01 §2.5: `platform/log` ·
// `platform/events` · `platform/consent`) and the three that grew beside them (`rate-limit` · `upload-scan` ·
// `unit-of-work`, ADR-127) keep their own `types.ts`; this file re-exports them plus the Result / envelope types
// and the `Registry` slot that live at the module root. Values live in index.ts.
import type {
  AppErrorDetails,
  ClientAppError,
  Weekday,
} from "@/modules/shared-types";

export type * from "./log/types";
export type * from "./events/types";
export type * from "./consent/types";
export type * from "./privacy/types";
export type * from "./rate-limit/types";
export type * from "./upload-scan/types";
export type * from "./unit-of-work/types";

// ── The London wall clock (01 §4f) ──

/**
 * A London calendar date (`YYYY-MM-DD`) with the London hour, minute and weekday (0 = Sunday) at an instant —
 * what "today / yesterday in London" and "is it the declared London hour" are read from (`londonWallClock`).
 */
export type LondonWallClock = {
  readonly date: string;
  readonly hour: number;
  readonly minute: number;
  readonly weekday: Weekday;
};

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

// ── Unit of work (01 §6.3; 03 §1.4; ADR-127) — the sub-module's own `types.ts`, re-exported above ──

/** A boot-time registration slot (see `lib/create-registry.ts`). */
export type Registry<T> = {
  readonly get: () => T;
  readonly set: (next: T) => void;
};
