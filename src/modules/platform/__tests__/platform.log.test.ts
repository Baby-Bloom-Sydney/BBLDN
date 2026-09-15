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
import type { LogLine } from "@/modules/platform";

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
