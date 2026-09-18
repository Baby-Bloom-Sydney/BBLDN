// `platform/privacy` — the erasure connector (07 §6.1; B-46). The database half is `int.account-erasure`; this
// suite is the orchestration, which is where the two rulings that are not SQL live:
//
//   * **where the subject comes from.** The self-service road is handed its own session's id; the admin road is
//     handed a *request id* and reads the subject off the row (ADR-145; 07 §5.4 row 6). A test that passed the
//     subject to `runRequest` would not be able to tell the two apart, so this one proves the admin road ignores
//     anything but the row.
//   * **what the job does when an object will not go.** It proceeds, logs `ALERT_ERASURE_OBJECT_STUCK`, and does
//     **not** write an evidence row for it — because `file_retention_log` is evidence of deletion, and evidence
//     that claims a deletion which did not happen is worse than no evidence.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrivacy, memoryPrivacyStore, privacy } from "@/modules/platform";
import type { ErasureObject, MemoryPrivacyStore } from "@/modules/platform";

const SUBJECT = "user-1";
const OTHER = "user-2";

const OBJECTS: ReadonlyArray<ErasureObject> = Object.freeze([
  Object.freeze({
    bucket: "profile-pictures",
    path: `parent/${SUBJECT}/a.jpg`,
    entityKind: "user" as const,
    entityId: SUBJECT,
  }),
  Object.freeze({
    bucket: "development-images",
    path: "children/child-1/first-steps.jpg",
    entityKind: "child" as const,
    entityId: "child-1",
  }),
]);

function build(options?: Parameters<typeof memoryPrivacyStore>[0]) {
  const store: MemoryPrivacyStore = memoryPrivacyStore({
    objects: OBJECTS,
    ...options,
  });
  const onErased = vi.fn(async () => undefined);
  return {
    store,
    onErased,
    connector: createPrivacy({ store, onErased }),
  };
}

describe("platform/privacy — unconfigured, it refuses rather than answering yes", () => {
  it("★ the module-level connector fails closed until boot installs one", async () => {
    // For an erasure, "fails closed" has a sharper meaning than usual: the failure mode to design against is
    // telling a person her account was deleted when nothing ran.
    const result = await privacy.eraseOwnAccount({ subjectUserId: SUBJECT });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.details?.reason).toBe("privacy-not-configured");
  });
});

describe("platform/privacy — the self-service road", () => {
  it("opens a request, removes the objects, runs the one transaction, and records the erasure", async () => {
    const { store, connector, onErased } = build();
    const result = await connector.eraseOwnAccount({ subjectUserId: SUBJECT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outcome).toBe("erased");
      expect(result.value.objectCount).toBe(2);
      expect(result.value.retainedClasses).toEqual([
        "money",
        "consent",
        "safeguarding",
      ]);
    }
    expect(store.removed).toHaveLength(2);
    expect(store.requests[0].state).toBe("completed");
    expect(onErased).toHaveBeenCalledTimes(1);
  });

  it("★ a second request succeeds, changes nothing, and does NOT record a second erasure", async () => {
    const { connector, onErased } = build();
    await connector.eraseOwnAccount({ subjectUserId: SUBJECT });
    const again = await connector.eraseOwnAccount({ subjectUserId: SUBJECT });

    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.outcome).toBe("already-erased");
    // `account.deleted` records the erasure, not the asking. A second event would make the audit trail say it
    // happened twice, which is the one thing an audit trail must not do.
    expect(onErased).toHaveBeenCalledTimes(1);
  });

  it("★ a refusal is reported as a refusal, with its reason, and records no erasure", async () => {
    const { connector, store, onErased } = build({
      refuse: { [SUBJECT]: "live-placement" },
    });
    const result = await connector.eraseOwnAccount({ subjectUserId: SUBJECT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outcome).toBe("refused");
      expect(result.value.reason).toBe("live-placement");
    }
    expect(onErased).not.toHaveBeenCalled();
    expect(store.requests[0].refusalReason).toBe("live-placement");
  });

  it("★ an object that will not go is logged, is not counted as evidence, and does not stop the scrub", async () => {
    const warn = vi.fn();
    const store = memoryPrivacyStore({
      objects: OBJECTS,
      unremovable: [OBJECTS[0].path],
    });
    const log = {
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
      child: vi.fn(() => log),
    };
    const connector = createPrivacy({ store, log });
    const result = await connector.eraseOwnAccount({ subjectUserId: SUBJECT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outcome).toBe("erased");
      // One object went; one did not. The count is what actually happened, not what was attempted.
      expect(result.value.objectCount).toBe(1);
    }
    expect(store.removed.map((o) => o.path)).toEqual([OBJECTS[1].path]);
    expect(log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ alert: "ALERT_ERASURE_OBJECT_STUCK" }),
    );
  });
});

describe("platform/privacy — the admin road takes a request, never a person", () => {
  it("resolves the email to a subject server-side and erases nothing while doing it", async () => {
    const { connector, store, onErased } = build({
      subjectsByEmail: { "asked@example.test": SUBJECT },
    });
    const opened = await connector.openRequestForEmail({
      email: "asked@example.test",
      requestedBy: "admin-1",
    });

    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.value.subjectUserId).toBe(SUBJECT);
      expect(opened.value.road).toBe("admin");
      expect(opened.value.state).toBe("requested");
    }
    // Step 1 records an intent. A mistyped address must produce a wrong request row, never a wrong erasure.
    expect(store.erased).toEqual([]);
    expect(onErased).not.toHaveBeenCalled();
  });

  it("refuses an address that matches no account", async () => {
    const { connector } = build({ subjectsByEmail: {} });
    const opened = await connector.openRequestForEmail({
      email: "nobody@example.test",
      requestedBy: "admin-1",
    });
    expect(opened.ok).toBe(false);
    if (!opened.ok)
      expect(opened.error.details?.reason).toBe("subject-not-found");
  });

  it("★ `runRequest` erases the SUBJECT OF THE ROW — the caller names a request, not a person", async () => {
    const { connector, store } = build({
      subjectsByEmail: { "asked@example.test": SUBJECT },
    });
    const opened = await connector.openRequestForEmail({
      email: "asked@example.test",
      requestedBy: "admin-1",
    });
    if (!opened.ok) throw new Error("the request was not opened");

    const run = await connector.runRequest(opened.value.requestId);
    expect(run.ok).toBe(true);
    // The only subject the road ever saw was the one on the row. `OTHER` is never reachable from this call.
    expect(store.erased).toEqual([SUBJECT]);
    expect(store.erased).not.toContain(OTHER);
  });

  it("refuses a request that has already been answered, rather than running it twice", async () => {
    const { connector } = build();
    await connector.eraseOwnAccount({ subjectUserId: SUBJECT });
    const requestId = "req-1";
    const again = await connector.runRequest(requestId);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.details?.reason).toBe("request-not-open");
  });

  it("refuses a request id that does not exist", async () => {
    const { connector } = build();
    const missing = await connector.runRequest("req-does-not-exist");
    expect(missing.ok).toBe(false);
    if (!missing.ok)
      expect(missing.error.details?.reason).toBe("request-not-found");
  });
});

describe("platform/privacy — the sweep is a re-attempt, and says what is still open", () => {
  let now: string;
  beforeEach(() => {
    now = new Date().toISOString();
  });

  it("reports nothing to do when no request is open", async () => {
    const { connector } = build();
    const swept = await connector.sweepRequests(now as never);
    expect(swept.ok).toBe(true);
    if (swept.ok) expect(swept.value).toEqual({ handled: 0, skipped: 0 });
  });

  it("★ counts a refused request as SKIPPED, not handled — it is still somebody's open right", async () => {
    const { store, connector } = build({
      refuse: { [SUBJECT]: "live-placement" },
    });
    await store.openRequest({
      subjectUserId: SUBJECT,
      requestedBy: SUBJECT,
      road: "self-service",
    });
    const swept = await connector.sweepRequests(now as never);
    expect(swept.ok).toBe(true);
    if (swept.ok) expect(swept.value).toEqual({ handled: 0, skipped: 1 });
  });

  it("completes an open request and counts it handled", async () => {
    const { store, connector } = build();
    await store.openRequest({
      subjectUserId: SUBJECT,
      requestedBy: SUBJECT,
      road: "admin",
    });
    const swept = await connector.sweepRequests(now as never);
    expect(swept.ok).toBe(true);
    if (swept.ok) expect(swept.value).toEqual({ handled: 1, skipped: 0 });
    expect(store.erased).toEqual([SUBJECT]);
  });
});
