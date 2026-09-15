// 01 §2.4 / 02 R-4 — the consent connector's inside over the `ConsentStore` port: rows are immutable and
// append-only (a decline is a new row), a document consent must name the current version (02 §4.1
// "document_version = latest at write, checked in the action"), the biometric notice keeps its invariants,
// cookie consent supersedes the previous row and expires (07 §6.2 row 12), `hasMarketing` is the PECR gate.
import type {
  AppError,
  ConsentRecordId,
  Instant,
  Result,
  UserId,
} from "@/modules/shared-types";
import type {
  BiometricConsentInput,
  BiometricConsentRecord,
  Consent,
  ConsentDeps,
  ConsentErrorDetails,
  ConsentPurpose,
  ConsentRecord,
  ConsentSubject,
  CookieConsentInput,
  CookieConsentRecord,
  InformedActionInput,
  LegalDocumentId,
  RecordConsentInput,
} from "../types";
import { err } from "../../lib/err";
import { newId } from "../../lib/new-id";
import { nowInstant } from "../../lib/now-instant";
import { ok } from "../../lib/ok";
import { CONSENT_PURPOSES } from "./consent-purposes";

const MS_PER_DAY = 86400000;
const KNOWN_PURPOSES: ReadonlySet<string> = new Set(CONSENT_PURPOSES);
type Resolved = ConsentDeps & {
  readonly clock: () => Instant;
  readonly newId: () => ConsentRecordId;
};
type Uow = { readonly uow?: import("@/modules/shared-types").UnitOfWork };

const isDocumentPurpose = (
  purpose: ConsentPurpose,
): purpose is LegalDocumentId => purpose !== "vaccination-status";
/** A store failure crosses the connector with its code and message; its details ride as `cause` (server side only). */
const propagate = (
  error: AppError,
): { readonly ok: false; readonly error: AppError<ConsentErrorDetails> } =>
  err<ConsentErrorDetails>(error.code, error.message, undefined, error);
const addDays = (at: Instant, days: number): Instant =>
  new Date(Date.parse(at) + days * MS_PER_DAY).toISOString() as Instant;

async function checkDocument(
  input: InformedActionInput | RecordConsentInput,
  required: boolean,
  deps: Resolved,
): Promise<Result<void, ConsentErrorDetails>> {
  if (!KNOWN_PURPOSES.has(input.purpose))
    return err("VALIDATION", "Unknown consent purpose", {
      reason: "unknown-purpose",
    });
  if (!isDocumentPurpose(input.purpose)) return ok(undefined);
  if (input.document === undefined)
    return required
      ? err("VALIDATION", "A document consent names its document", {
          reason: "document-required",
        })
      : ok(undefined);
  const current = await deps.store.currentDocument(input.purpose);
  if (!current.ok) return propagate(current.error);
  if (
    current.value === null ||
    current.value.version !== input.document.version ||
    current.value.id !== input.document.id
  ) {
    return err("VALIDATION", "The document version is not the current one", {
      reason: "document-not-current",
    });
  }
  return ok(undefined);
}

async function insertConsent(
  row: ConsentRecord,
  opts: Uow,
  deps: Resolved,
): Promise<Result<ConsentRecord, ConsentErrorDetails>> {
  const inserted = await deps.store.insertConsent(row, opts);
  return inserted.ok ? ok(row) : propagate(inserted.error);
}

async function recordConsent(
  input: RecordConsentInput,
  opts: Uow,
  deps: Resolved,
): Promise<Result<ConsentRecord, ConsentErrorDetails>> {
  const checked = await checkDocument(input, true, deps);
  if (!checked.ok) return checked;
  return insertConsent(
    Object.freeze({ ...input, id: deps.newId(), createdAt: deps.clock() }),
    opts,
    deps,
  );
}

async function recordInformedAction(
  input: InformedActionInput,
  opts: Uow,
  deps: Resolved,
): Promise<Result<ConsentRecord, ConsentErrorDetails>> {
  const checked = await checkDocument(input, false, deps);
  if (!checked.ok) return checked;
  return insertConsent(
    Object.freeze({
      ...input,
      consentGiven: true,
      id: deps.newId(),
      createdAt: deps.clock(),
    }),
    opts,
    deps,
  );
}

async function recordBiometricConsent(
  input: BiometricConsentInput,
  opts: Uow,
  deps: Resolved,
): Promise<Result<BiometricConsentRecord, ConsentErrorDetails>> {
  if (input.noticeScrollCompletedAt < input.noticeOpenedAt)
    return err("VALIDATION", "Scroll completed before the notice was opened", {
      reason: "scroll-before-open",
    });
  const row: BiometricConsentRecord = Object.freeze({
    ...input,
    id: deps.newId(),
    createdAt: deps.clock(),
  });
  const inserted = await deps.store.insertBiometric(row, opts);
  return inserted.ok ? ok(row) : propagate(inserted.error);
}

async function recordCookieConsent(
  input: CookieConsentInput,
  deps: Resolved,
): Promise<Result<CookieConsentRecord>> {
  const now = deps.clock();
  const row: CookieConsentRecord = Object.freeze({
    ...input,
    id: deps.newId(),
    createdAt: now,
    expiryDate: addDays(now, deps.cookieExpiryDays),
  });
  const inserted = await deps.store.insertCookie(row);
  if (!inserted.ok) return inserted;
  const emitted =
    deps.onCookieConsent === undefined
      ? ok(undefined)
      : await deps.onCookieConsent(row);
  if (!emitted.ok)
    deps.log?.warn("consent.updated not emitted", {
      alert: "ALERT_EVENT_SINK_FAILED",
      sink: "event-log",
      consentRecordId: row.id,
      errorCode: emitted.error.code,
      cause: emitted.error.cause,
    });
  return ok(row);
}

async function hasMarketing(
  subject: ConsentSubject,
  deps: Resolved,
): Promise<Result<boolean>> {
  const current = await deps.store.currentCookie(subject);
  if (!current.ok) return current;
  return ok(
    current.value !== null &&
      current.value.expiryDate > deps.clock() &&
      current.value.marketingEnabled,
  );
}

async function hasConsent(
  userId: UserId,
  purpose: ConsentPurpose,
  deps: Resolved,
): Promise<Result<boolean>> {
  const latest = await deps.store.latestConsent(userId, purpose);
  return latest.ok ? ok(latest.value?.consentGiven === true) : latest;
}

async function getPolicy(
  purpose: ConsentPurpose,
  deps: Resolved,
): Promise<Result<import("../types").ConsentPolicy, ConsentErrorDetails>> {
  if (!KNOWN_PURPOSES.has(purpose))
    return err("VALIDATION", "Unknown consent purpose", {
      reason: "unknown-purpose",
    });
  if (!isDocumentPurpose(purpose)) return ok({ purpose });
  const current = await deps.store.currentDocument(purpose);
  if (!current.ok) return propagate(current.error);
  return ok(
    current.value === null
      ? { purpose }
      : { purpose, currentDocument: current.value },
  );
}

export function createConsent(deps: ConsentDeps): Consent {
  const resolved: Resolved = {
    ...deps,
    clock: deps.clock ?? nowInstant,
    newId: deps.newId ?? (() => newId<ConsentRecordId>()),
  };
  return Object.freeze({
    recordConsent: (input, opts = {}) => recordConsent(input, opts, resolved),
    recordInformedAction: (input, opts = {}) =>
      recordInformedAction(input, opts, resolved),
    recordBiometricConsent: (input, opts = {}) =>
      recordBiometricConsent(input, opts, resolved),
    recordCookieConsent: (input) => recordCookieConsent(input, resolved),
    getPolicy: (purpose) => getPolicy(purpose, resolved),
    hasMarketing: (subject) => hasMarketing(subject, resolved),
    hasConsent: (userId, purpose) => hasConsent(userId, purpose, resolved),
  });
}
