// The structured logger (01 §4b; 07 §9.2 / §11 item 13): fields, levels, request id, PII scrubbed by key and by
// value, JSON in production / readable in development, `error` lines forwarded to the tracker, null tracker
// without a DSN, the console sink is the only console caller.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Instant } from "@/modules/shared-types";
import {
  ALERT_NAMES,
  configureLog,
  consoleSink,
  createLogger,
  log,
  nullErrorTracker,
  resolveErrorTracker,
  scrubPii,
  sentryErrorTracker,
} from "@/modules/platform";
import type { ConsentContext, LogLine } from "@/modules/platform";

const FIXED = "2026-09-15T08:00:00.000Z" as Instant;
const clock = () => FIXED;

function capture() {
  const lines: LogLine[] = [];
  return { lines, sink: (line: LogLine) => void lines.push(line) };
}

describe("platform/log — scrubPii (01 §4b never-logged list; 07 §9.2)", () => {
  it("redacts by key: emails, names, phones, tokens, keys, secrets, passwords, bodies, documents, cookies", () => {
    const scrubbed = scrubPii({
      email: "a@b.test",
      userEmail: "a@b.test",
      firstName: "Ann",
      name: "Ann Smith",
      phone: "+447700900123", // config-literal-ok: a PII fixture the scrubber must redact, not a locale value
      mobile: "07700 900123",
      token: "abc",
      apiKey: "k",
      secret: "s",
      password: "p",
      authorization: "Bearer x",
      cookie: "sid=1",
      body: { anything: 1 },
      documentContents: "…",
      requestId: "req-1",
      idempotencyKey: "idem-1",
      userId: "00000000-0000-4000-8000-000000000000",
    });
    const redacted = "[redacted]";
    expect(scrubbed).toEqual({
      email: redacted,
      userEmail: redacted,
      firstName: redacted,
      name: redacted,
      phone: redacted,
      mobile: redacted,
      token: redacted,
      apiKey: redacted,
      secret: redacted,
      password: redacted,
      authorization: redacted,
      cookie: redacted,
      body: redacted,
      documentContents: redacted,
      requestId: "req-1",
      idempotencyKey: "idem-1",
      userId: "00000000-0000-4000-8000-000000000000",
    });
  });

  it("redacts by value: email-shaped, phone-shaped, JWT-shaped and provider-key-shaped strings, nested", () => {
    const scrubbed = scrubPii({
      note: "contact ann@example.test please",
      nested: { deeper: { phoneLike: "+44 7700 900123", fine: "hello" } }, // config-literal-ok: PII fixture
      list: [
        "ok",
        "abcdefghijkl.mnopqrstuvwx.yz0123456789_-", // three base64url segments = JWT-shaped, not a real token
      ],
      stripe: "sk_live_ci-dummy", // prefix only — a provider-key shape, not a key (hyphen keeps the gitleaks rule off a placeholder)
      resend: "re_123456789",
      count: 3,
    });
    expect(scrubbed).toEqual({
      note: "[redacted]",
      nested: { deeper: { phoneLike: "[redacted]", fine: "hello" } },
      list: ["ok", "[redacted]"],
      stripe: "[redacted]",
      resend: "[redacted]",
      count: 3,
    });
  });

  it("truncates long strings (request bodies) and bounds depth; Errors become name + scrubbed message", () => {
    const scrubbed = scrubPii({
      big: "x".repeat(5000),
      deep: { a: { b: { c: { d: { e: "too deep" } } } } },
      failure: new Error("provider said ann@example.test"),
    }) as Record<string, unknown>;
    expect((scrubbed.big as string).length).toBeLessThan(2100);
    expect(scrubbed.big).toMatch(/…\[truncated\]$/);
    expect(JSON.stringify(scrubbed.deep)).toContain("[truncated]");
    expect(scrubbed.failure).toEqual({ name: "Error", message: "[redacted]" });
  });

  it("returns a new object and never mutates the input", () => {
    const input = { email: "a@b.test", nested: { token: "t" } };
    const out = scrubPii(input);
    expect(out).not.toBe(input);
    expect(input.email).toBe("a@b.test");
    expect(input.nested.token).toBe("t");
  });
});

describe("platform/log — createLogger (01 §4b)", () => {
  it("writes ts · level · msg · fields, scrubbed, to the sink", () => {
    const { lines, sink } = capture();
    const logger = createLogger({ sink, clock, base: { module: "platform" } });
    logger.info("hello", {
      requestId: "req-1",
      action: "emit",
      durationMs: 3,
      email: "a@b.test",
    });
    expect(lines).toEqual([
      {
        ts: FIXED,
        level: "info",
        msg: "hello",
        module: "platform",
        requestId: "req-1",
        action: "emit",
        durationMs: 3,
        email: "[redacted]",
      },
    ]);
  });

  it("drops lines below minLevel and child() carries its fields", () => {
    const { lines, sink } = capture();
    const logger = createLogger({ sink, clock, minLevel: "info" });
    logger.debug("hidden");
    const child = logger.child({ requestId: "req-2", module: "comms" });
    child.warn("careful", { provider: "resend" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "warn",
      requestId: "req-2",
      module: "comms",
      provider: "resend",
    });
  });

  it("forwards only `error` lines to the tracker, with alert + requestId as tags and no PII", () => {
    const { sink } = capture();
    const captured: Array<{
      message: string;
      tags: Record<string, string>;
      extra: Record<string, unknown>;
    }> = [];
    const tracker = sentryErrorTracker(
      (message, tags, extra) =>
        void captured.push({ message, tags: { ...tags }, extra: { ...extra } }),
    );
    const logger = createLogger({ sink, clock, tracker });
    logger.warn("not forwarded", { alert: "ALERT_CRON_FAILED" });
    logger.error("cron blew up", {
      alert: "ALERT_CRON_FAILED",
      requestId: "req-3",
      module: "positions",
      errorCode: "INTERNAL",
      email: "a@b.test",
      attempts: 2,
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      message: "cron blew up",
      tags: {
        alert: "ALERT_CRON_FAILED",
        requestId: "req-3",
        module: "positions",
        errorCode: "INTERNAL",
      },
      extra: { ts: FIXED, level: "error", attempts: 2, email: "[redacted]" },
    });
  });

  it("never throws into the caller when the sink throws", () => {
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const logger = createLogger({
      sink: () => {
        throw new Error("disk full");
      },
      clock,
    });
    expect(() => logger.info("still fine")).not.toThrow();
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("log sink failed");
    stderr.mockRestore();
  });

  it("lists the 01 §4b alert hooks + ALERT_UPLOAD_MALWARE, add-only", () => {
    expect(ALERT_NAMES).toEqual([
      "ALERT_CRON_FAILED",
      "ALERT_WEBHOOK_FAILED",
      "ALERT_WEBHOOK_SIGNATURE_INVALID",
      "ALERT_PROVIDER_DOWN",
      "ALERT_EMAIL_SEND_FAILED",
      "ALERT_ENV_INVALID",
      "ALERT_CALL_OVERDUE",
      "ALERT_KATIE_DAILY_CAP",
      "ALERT_EVENT_SINK_FAILED",
      "ALERT_BACKUP_FAILED",
      "ALERT_RATE_LIMIT_BURST",
      "ALERT_CSP_VIOLATION",
      "ALERT_DISPLACEMENT_CAP",
      "ALERT_UPLOAD_MALWARE",
    ]);
    expect(Object.isFrozen(ALERT_NAMES)).toBe(true);
  });
});

describe("platform/log — console sink + error tracker resolution", () => {
  afterEach(() => vi.restoreAllMocks());

  it("json format writes one JSON line per call, error → console.error, warn → console.warn, else console.log", () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const sink = consoleSink("json");
    const line = (level: LogLine["level"]): LogLine => ({
      ts: FIXED,
      level,
      msg: "m",
      requestId: "r",
    });
    sink(line("info"));
    sink(line("warn"));
    sink(line("error"));
    sink(line("debug"));
    expect(out).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(out.mock.calls[0]?.[0]))).toEqual({
      ts: FIXED,
      level: "info",
      msg: "m",
      requestId: "r",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("pretty format writes a readable line with the fields appended", () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => undefined);
    consoleSink("pretty")({
      ts: FIXED,
      level: "info",
      msg: "started",
      requestId: "r",
      durationMs: 12,
    });
    const written = String(out.mock.calls[0]?.[0]);
    expect(written).toContain("INFO");
    expect(written).toContain("started");
    expect(written).toContain("requestId=r");
    expect(written).toContain("durationMs=12");
  });

  it("resolveErrorTracker is the null tracker without a DSN or without a capture function", () => {
    const captureFn = vi.fn();
    expect(resolveErrorTracker({ dsn: undefined, capture: captureFn }).id).toBe(
      "null",
    );
    expect(
      resolveErrorTracker({ dsn: "https://x@o.ingest.sentry.io/1" }).id,
    ).toBe("null");
    expect(
      resolveErrorTracker({
        dsn: "https://x@o.ingest.sentry.io/1",
        capture: captureFn,
      }).id,
    ).toBe("sentry");
    expect(nullErrorTracker.id).toBe("null");
    expect(() =>
      nullErrorTracker.capture({ ts: FIXED, level: "error", msg: "m" }),
    ).not.toThrow();
  });

  it("the module-level `log` delegates to whatever configureLog installed", () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => undefined);
    configureLog({ format: "json", minLevel: "info" });
    log.info("configured", { requestId: "r-9" });
    expect(JSON.parse(String(out.mock.calls.at(-1)?.[0]))).toMatchObject({
      level: "info",
      msg: "configured",
      requestId: "r-9",
    });
  });
});


// ---------------------------------------------------------------------------
// S3b — the S3 security review's findings (docs/build-progress.md ★ entry).
// ---------------------------------------------------------------------------

const REDACTED = "[redacted]";

describe("platform/log — S3b HIGH-2: sensitive keys (01 §4b; 07 §2.7(a))", () => {
  it("redacts the plural forms the ($|_) boundary used to miss", () => {
    expect(
      scrubPii({
        apiKeys: ["k1", "k2"],
        tokens: ["t"],
        emails: ["a@b.test"],
        phones: ["0000"],
        secrets: { stripe: "s" },
        passwords: ["p"],
        documents: ["d"],
        names: ["Ann"],
        addresses: ["1 High St"],
      }),
    ).toEqual({
      apiKeys: REDACTED,
      tokens: REDACTED,
      emails: REDACTED,
      phones: REDACTED,
      secrets: REDACTED,
      passwords: REDACTED,
      documents: REDACTED,
      names: REDACTED,
      addresses: REDACTED,
    });
  });

  it("redacts contactNumber, userAgent, sessionId and a bare ip / ip_address", () => {
    expect(
      scrubPii({
        contactNumber: "020 7946 0000", // config-literal-ok: a PII fixture the scrubber must redact
        userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
        sessionId: "sess-abc",
        ip: "203.0.113.7",
        ip_address: "203.0.113.7",
        ipAddress: "203.0.113.7",
        clientIp: "203.0.113.7",
      }),
    ).toEqual({
      contactNumber: REDACTED,
      userAgent: REDACTED,
      sessionId: REDACTED,
      ip: REDACTED,
      ip_address: REDACTED,
      ipAddress: REDACTED,
      clientIp: REDACTED,
    });
  });

  it("keeps the safe keys the logger needs (they are not collateral of the plural boundary)", () => {
    expect(
      scrubPii({
        requestId: "req-1",
        idempotencyKey: "idem-1",
        eventName: "position.created",
        templateId: "welcome",
        module: "platform",
        action: "emit",
        bucketKey: "b/k",
        sinkId: "memory",
        durationMs: 12,
      }),
    ).toEqual({
      requestId: "req-1",
      idempotencyKey: "idem-1",
      eventName: "position.created",
      templateId: "welcome",
      module: "platform",
      action: "emit",
      bucketKey: "b/k",
      sinkId: "memory",
      durationMs: 12,
    });
  });

  it("a ConsentContext passed as log fields leaks none of its three tracked values (consent/types.ts)", () => {
    const context: ConsentContext = {
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      sessionId: "sess-abc",
    };
    const { lines, sink } = capture();
    createLogger({ sink, clock }).info("consent recorded", {
      context,
      purpose: "privacy-policy",
    });
    const written = JSON.stringify(lines[0]);
    expect(written).not.toContain("203.0.113.7");
    expect(written).not.toContain("Mozilla");
    expect(written).not.toContain("sess-abc");
    expect(lines[0]).toMatchObject({ purpose: "privacy-policy" });
  });
});

describe("platform/log — S3b MEDIUM: non-string values are content-checked too", () => {
  it("redacts a PII-shaped number under a non-sensitive key, keeps ordinary numbers", () => {
    expect(
      scrubPii({
        contact: 447700900123, // config-literal-ok: a PII fixture the scrubber must redact
        durationMs: 3,
        count: 1234,
        stamp: 20260915,
        nested: { alt: [447700900123] }, // config-literal-ok: same fixture, nested
      }),
    ).toEqual({
      contact: REDACTED,
      durationMs: 3,
      count: 1234,
      stamp: 20260915,
      nested: { alt: [REDACTED] },
    });
  });
});

describe("platform/log — S3b HIGH-1: `msg` is scrubbed before any sink or tracker sees it", () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ["an email", "signup failed for ann@example.test", "ann@example.test"],
    ["a spaced phone", "sms to +44 7700 900123 failed", "7700 900123"], // config-literal-ok: PII fixture
    [
      "a JWT",
      "token abcdefghijkl.mnopqrstuvwx.yz0123456789_- rejected",
      "abcdefghijkl",
    ],
    ["a provider key", "stripe said sk_live_ci-dummy is dead", "sk_live"],
    [
      "a bearer token",
      "header Authorization: Bearer abcdef123456xyz rejected",
      "abcdef123456xyz",
    ],
  ];

  it.each(cases)("redacts %s in msg at every level", (_name, msg, secret) => {
    for (const level of ["debug", "info", "warn", "error"] as const) {
      const { lines, sink } = capture();
      createLogger({ sink, clock, minLevel: "debug" })[level](msg);
      expect(lines[0]?.msg, level).not.toContain(secret);
      expect(lines[0]?.msg, level).toContain(REDACTED);
    }
  });

  it("leaves a clean message alone and still truncates a very long one", () => {
    const { lines, sink } = capture();
    const logger = createLogger({ sink, clock });
    logger.info("position created", { requestId: "req-1" });
    expect(lines[0]?.msg).toBe("position created");
    logger.info("y".repeat(5000));
    expect(String(lines[1]?.msg).length).toBeLessThan(2100);
    expect(lines[1]?.msg).toMatch(/…\[truncated\]$/);
  });

  it("the error tracker receives the scrubbed message, not the raw one", () => {
    const captured: string[] = [];
    const tracker = sentryErrorTracker((message) => void captured.push(message));
    const { lines, sink } = capture();
    createLogger({ sink, clock, tracker }).error(
      "payout failed for ann@example.test",
      { alert: "ALERT_PROVIDER_DOWN" },
    );
    expect(captured[0]).not.toContain("ann@example.test");
    expect(captured[0]).toContain(REDACTED);
    expect(captured[0]).toBe(lines[0]?.msg);
  });
});
