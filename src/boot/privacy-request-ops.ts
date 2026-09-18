// The request-ledger half of the `PrivacyStore` (07 §6.1; B-46). Everything here is **service scope**:
// `account_erasure_requests` has a SELECT policy for the subject and the admin and no write policy for anyone, so
// both roads reach it through this port or not at all.
//
// Each operation is its own top-level function rather than a method inside one long object literal — the 50-line
// rule is a ratchet that may only shrink (`eslint.long-functions.json`), so a new file earns its place by being
// small rather than by being added to that list.
import type { DataAccessPort } from "@/modules/auth";
import { ok } from "@/modules/platform";
import type { PrivacyStore } from "@/modules/platform";
import { erasureRequestFromRow } from "./erasure-request-from-row";

const service = { scope: "service" as const };

type RawRequest = {
  readonly id: string;
  readonly subject_user_id: string;
  readonly road: string;
  readonly state: string;
  readonly refusal_reason: string | null;
  readonly requested_at: string;
};

const openRequest =
  (port: DataAccessPort): PrivacyStore["openRequest"] =>
  async (input) => {
    const opened = await port.run(
      {
        name: "platform.privacy.openRequest",
        exec: async (q) => {
          // `0028`'s partial unique already refuses a second open request per subject; reading first turns that
          // refusal into the answer the caller wants — her existing request — instead of a `23505`.
          const existing = await q
            .from("account_erasure_requests")
            .eq("subject_user_id", input.subjectUserId)
            .select();
          const open = existing.find((row) => row.state === "requested");
          if (open !== undefined) return open as RawRequest;
          return (await q.from("account_erasure_requests").insert({
            subject_user_id: input.subjectUserId,
            requested_by: input.requestedBy,
            road: input.road,
          })) as RawRequest;
        },
      },
      service,
    );
    if (!opened.ok) return opened as never;
    return ok(erasureRequestFromRow(opened.value));
  };

const readRequest =
  (port: DataAccessPort): PrivacyStore["readRequest"] =>
  async (requestId) => {
    const read = await port.run(
      {
        name: "platform.privacy.readRequest",
        exec: async (q) =>
          (await q
            .from("account_erasure_requests")
            .eq("id", requestId)
            .single()) as RawRequest | null,
      },
      service,
    );
    if (!read.ok) return read as never;
    return ok(read.value === null ? null : erasureRequestFromRow(read.value));
  };

const listOpenRequests =
  (port: DataAccessPort): PrivacyStore["listOpenRequests"] =>
  async (limit) => {
    const listed = await port.run(
      {
        name: "platform.privacy.listOpenRequests",
        exec: async (q) =>
          (await q
            .from("account_erasure_requests")
            .select()) as ReadonlyArray<RawRequest>,
      },
      service,
    );
    if (!listed.ok) return listed as never;
    return ok(
      listed.value
        .filter((row) => row.state === "requested")
        .slice(0, limit)
        .map(erasureRequestFromRow),
    );
  };

/**
 * The subject of an email-borne request, resolved from `user_profiles` — the mirror `0002` keeps of
 * `auth.users.email` (C-8), which is the only place this application may read an address by. Never an id the
 * caller supplied (ADR-145; 07 §5.4 row 6).
 */
const findSubjectByEmail =
  (port: DataAccessPort): PrivacyStore["findSubjectByEmail"] =>
  async (email) => {
    const found = await port.run(
      {
        name: "platform.privacy.findSubjectByEmail",
        exec: async (q) => {
          const row = (await q
            .from("user_profiles")
            .eq("email", email)
            .single()) as { readonly user_id: string } | null;
          return row?.user_id ?? null;
        },
      },
      service,
    );
    if (!found.ok) return found as never;
    return ok(found.value);
  };

export function privacyRequestOps(
  port: DataAccessPort,
): Pick<
  PrivacyStore,
  "openRequest" | "readRequest" | "listOpenRequests" | "findSubjectByEmail"
> {
  return Object.freeze({
    openRequest: openRequest(port),
    readRequest: readRequest(port),
    listOpenRequests: listOpenRequests(port),
    findSubjectByEmail: findSubjectByEmail(port),
  });
}
