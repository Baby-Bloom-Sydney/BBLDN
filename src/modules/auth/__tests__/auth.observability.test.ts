// The silent-failure review's findings, as tests. The rule this module lives by (01 §4a): a failure must be
// distinguishable from a legitimate empty answer. "No session" and "we could not tell" must never look the same —
// not to the gate, and not to whoever is reading the logs during an outage.
import { beforeEach, describe, expect, it, vi } from "vitest";

const logCalls: Array<{ level: string; msg: string; fields: unknown }> = [];

vi.mock("@/modules/platform", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const record =
    (level: string) =>
    (msg: string, fields?: unknown): void => {
      logCalls.push({ level, msg, fields });
    };
  return {
    ...actual,
    log: {
      debug: record("debug"),
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
    },
  };
});

const serverClient = {
  auth: {
    getUser: vi.fn(),
    getSession: vi.fn(),
    mfa: { getAuthenticatorAssuranceLevel: vi.fn() },
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    updateUser: vi.fn(),
    exchangeCodeForSession: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => serverClient),
}));
vi.mock("next/headers", () => ({
  cookies: () => ({
    getAll: () => [],
    set: () => {
      throw new Error("cookie store exploded for a reason we do not recognise");
    },
  }),
}));
vi.mock("@/modules/auth/lib/elevated-client", () => ({
  elevatedClient: () => serverClient,
}));

const { supabaseAuthDriver } = await import("../lib/supabase-auth-driver");
const { createAuth } = await import("../lib/create-auth");
const { stubAuth } = await import("../auth.stub");
const { fakeDriver } = await import("./fixtures/fake-driver");

const warnings = () => logCalls.filter((c) => c.level === "warn");

beforeEach(() => {
  logCalls.length = 0;
  vi.clearAllMocks();
  serverClient.auth.getSession.mockResolvedValue({
    data: { session: { expires_at: 1_800_000_000 } },
  });
  serverClient.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: "aal1" },
  });
});

describe("an expired or absent session is not an incident", () => {
  it.each([
    ["AuthSessionMissingError", 400],
    ["AuthApiError", 401],
    ["AuthApiError", 403],
  ])("%s (%s) reads as anonymous, silently", async (name, status) => {
    serverClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name, status, message: "session missing" },
    });
    expect(await supabaseAuthDriver().currentUser()).toBeNull();
    expect(warnings()).toEqual([]);
  });
});

describe("an identity provider we cannot reach IS an incident", () => {
  it.each([
    ["AuthRetryableFetchError", 0],
    ["AuthApiError", 503],
    ["AuthUnknownError", undefined],
  ])("%s (%s) throws so the port maps it to INTERNAL", async (name, status) => {
    serverClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name, status, message: "upstream unavailable" },
    });
    await expect(supabaseAuthDriver().currentUser()).rejects.toThrow();
  });

  it("reaches the caller as INTERNAL, never as ok(null) — the gate must not read it as a logout", async () => {
    serverClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthRetryableFetchError", status: 0, message: "down" },
    });
    const result = await createAuth({
      driver: supabaseAuthDriver(),
    }).getSession();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("INTERNAL");
  });
});

describe("an unreadable assurance level fails closed — and says so", () => {
  it("warns before returning aal null", async () => {
    serverClient.auth.getUser.mockResolvedValue({
      data: { user: { id: "u-1", email: null, identities: [] } },
      error: null,
    });
    serverClient.auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(
      new Error("mfa endpoint down"),
    );
    const user = await supabaseAuthDriver().currentUser();
    expect(user?.aal).toBeNull();
    expect(warnings().map((w) => w.msg)).toContain(
      "could not read the assurance level; failing closed",
    );
  });
});

describe("a failed cookie rotation is not a debug-level detail", () => {
  it("warns, and does not claim the benign reason for an error it did not recognise", async () => {
    const { createServerClient } = await import("@supabase/ssr");
    serverClient.auth.getUser.mockResolvedValue({
      data: { user: { id: "u-1", email: null, identities: [] } },
      error: null,
    });
    await supabaseAuthDriver().currentUser();
    const options = vi
      .mocked(createServerClient)
      .mock.calls.at(-1)?.[2] as unknown as {
      cookies: { setAll: (list: ReadonlyArray<unknown>) => void };
    };
    // The store this spec installed throws on `set`, which is not the read-only refusal Next raises in an RSC.
    options.cookies.setAll([{ name: "a", value: "b", options: {} }]);
    const warned = warnings().find((w) =>
      w.msg.includes("session cookie write failed"),
    );
    expect(warned).toBeDefined();
    expect(warned?.fields).not.toHaveProperty("reason");
    expect(warned?.fields).toHaveProperty("cause");
  });
});

describe("a credential failure keeps its cause server-side (01 §4a)", () => {
  it("signIn reports UNAUTHENTICATED to the caller and logs the real reason", async () => {
    const { driver } = fakeDriver({ throwOn: "signInWithPassword" });
    const result = await createAuth({ driver }).signIn({
      email: "a@b.test" as never,
      password: "a-long-enough-password",
    });
    expect(result.ok === false && result.error.code).toBe("UNAUTHENTICATED");
    expect(result.ok === false && result.error.message).not.toContain(
      "exploded",
    );
    expect(warnings().map((w) => w.msg)).toContain("sign-in failed");
  });

  it("handleAuthCallback does the same", async () => {
    const { driver } = fakeDriver({ throwOn: "exchangeCodeForSession" });
    const result = await createAuth({ driver }).handleAuthCallback("code");
    expect(result.ok === false && result.error.code).toBe("UNAUTHENTICATED");
    expect(warnings().map((w) => w.msg)).toContain("auth callback failed");
  });
});

describe("an authenticated account with no role row is a provisioning anomaly, not a typo", () => {
  it("signIn logs it distinctly while still returning the generic refusal", async () => {
    const { driver } = fakeDriver({
      user: {
        id: "u-1",
        email: "a@b.test",
        hasPassword: true,
        aal: "aal1",
        expiresAtEpochSeconds: 1,
      },
      role: null,
    });
    const result = await createAuth({ driver }).signIn({
      email: "a@b.test" as never,
      password: "a-long-enough-password",
    });
    expect(result.ok === false && result.error.code).toBe("UNAUTHENTICATED");
    expect(warnings().map((w) => w.msg)).toContain(
      "authenticated account has no role row",
    );
  });
});

describe("the stub cannot succeed where the real driver would fail", () => {
  it("refuses a callback code that names no account, even with someone signed in", async () => {
    const auth = stubAuth({
      users: [
        {
          id: "u-1",
          email: "a@b.test" as never,
          password: "a-long-enough-password",
          role: "parent",
        },
      ],
      signedInUserId: "u-1",
    });
    const result = await auth.handleAuthCallback("not-a-real-code");
    expect(result.ok).toBe(false);
  });
});

describe("the query surface refuses a shape it cannot honour", () => {
  it("a select that came back as something other than rows throws", async () => {
    const node: Record<string, unknown> = {};
    node.select = () => node;
    node.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: null, error: null });
    serverClient.from.mockReturnValue(node);
    await expect(
      supabaseAuthDriver()
        .query("session")
        .from("user_roles" as never)
        .select(),
    ).rejects.toThrow();
  });

  it("an insert that came back with no row throws rather than returning undefined", async () => {
    const node: Record<string, unknown> = {};
    for (const k of ["insert", "select"]) node[k] = () => node;
    node.single = async () => ({ data: null, error: null });
    serverClient.from.mockReturnValue(node);
    await expect(
      supabaseAuthDriver()
        .query("session")
        .from("user_roles" as never)
        .insert({} as never),
    ).rejects.toThrow();
  });
});
