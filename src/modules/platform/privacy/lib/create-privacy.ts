// The inside of `platform/privacy` (07 §6.1; B-46). Two roads reach the same one transaction, and they differ in
// exactly one thing: **where the subject comes from.**
//
//   * `eraseOwnAccount` — the subject is the session's own user id, handed down by the action that already
//     established it. There is nothing to derive.
//   * `runRequest` — the subject is read off the `account_erasure_requests` row the caller named by opaque id,
//     which is ADR-145's pattern and 07 §5.4 row 6's rule: an admin actioning an emailed request names a
//     **request**, never a person. `openRequestForEmail` is the step that turns an email into a subject, and it
//     erases nothing, so a mistyped address produces a wrong request row rather than a wrong erasure.
import { err } from "../../lib/err";
import type { Result } from "@/modules/shared-types";
import type {
  ErasureOutcome,
  ErasureRequest,
  Privacy,
  PrivacyDeps,
  PrivacyErrorDetails,
} from "../types";
import { runErasure } from "./run-erasure";
import { purgeScrubbedUsers } from "./purge-scrubbed-users";
import { sweepErasureRequests } from "./sweep-erasure-requests";

const notFound = (
  reason: PrivacyErrorDetails["reason"],
  message: string,
): Result<never, PrivacyErrorDetails> =>
  err<PrivacyErrorDetails>("NOT_FOUND", message, { reason });

async function eraseOwnAccount(
  input: {
    readonly subjectUserId: string;
    readonly road?: ErasureRequest["road"];
  },
  deps: PrivacyDeps,
): Promise<Result<ErasureOutcome, PrivacyErrorDetails>> {
  const request = await deps.store.openRequest({
    subjectUserId: input.subjectUserId,
    requestedBy: input.subjectUserId,
    road: input.road ?? "self-service",
  });
  if (!request.ok) return request;
  return runErasure(
    {
      subjectUserId: input.subjectUserId,
      requestId: request.value.requestId,
    },
    deps,
  );
}

async function openRequestForEmail(
  input: { readonly email: string; readonly requestedBy: string },
  deps: PrivacyDeps,
): Promise<Result<ErasureRequest, PrivacyErrorDetails>> {
  const subject = await deps.store.findSubjectByEmail(input.email);
  if (!subject.ok) return subject;
  if (subject.value === null)
    return notFound("subject-not-found", "No account matches that address.");
  return deps.store.openRequest({
    subjectUserId: subject.value,
    requestedBy: input.requestedBy,
    road: "admin",
  });
}

async function runRequest(
  requestId: string,
  deps: PrivacyDeps,
): Promise<Result<ErasureOutcome, PrivacyErrorDetails>> {
  const request = await deps.store.readRequest(requestId);
  if (!request.ok) return request;
  if (request.value === null)
    return notFound("request-not-found", "That request no longer exists.");
  if (request.value.state !== "requested")
    return err<PrivacyErrorDetails>(
      "CONFLICT",
      "That request has already been answered.",
      { reason: "request-not-open" },
    );
  return runErasure(
    {
      subjectUserId: request.value.subjectUserId,
      requestId: request.value.requestId,
    },
    deps,
  );
}

export function createPrivacy(deps: PrivacyDeps): Privacy {
  return Object.freeze({
    eraseOwnAccount: (input) => eraseOwnAccount(input, deps),
    openRequestForEmail: (input) => openRequestForEmail(input, deps),
    listOpenRequests: (limit) => deps.store.listOpenRequests(limit),
    runRequest: (requestId) => runRequest(requestId, deps),
    sweepRequests: (now) => sweepErasureRequests(now, deps),
    purgeScrubbedUsers: (now) => purgeScrubbedUsers(now, deps),
  });
}
