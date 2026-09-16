// The real driver's glue — the only place `@supabase/*` is touched (03 §11 row 9). What matters here is not the
// SDK but the boundaries: which scope each call uses (01 §6.3 named service-role uses), that a driver error is
// thrown so `DataAccessPort.run` can map it once, and that a session read never throws.
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const elevated = {
  from: vi.fn(),
  rpc: vi.fn(),
  storage: { from: vi.fn() },
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => serverClient),
}));
vi.mock("next/headers", () => ({
  cookies: () => ({ getAll: () => [], set: vi.fn() }),
}));
vi.mock("@/modules/auth/lib/elevated-client", () => ({
  elevatedClient: () => elevated,
}));

const { supabaseAuthDriver } = await import("../lib/supabase-auth-driver");

/** A `.from(table).select(...).eq(...).maybeSingle()` chain that resolves to the given result. */
const chain = (result: { data: unknown; error: unknown }) => {
  const node: Record<string, unknown> = {};
  for (const key of ["select", "eq", "insert", "update", "upsert"])
    node[key] = vi.fn(() => node);
  node.maybeSingle = vi.fn(async () => result);
  node.single = vi.fn(async () => result);
  node.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return node;
};

beforeEach(() => {
  vi.clearAllMocks();
  serverClient.auth.getUser.mockResolvedValue({
    data: {
      user: {
        id: "u-1",
        email: "someone@example.test",
        identities: [{ provider: "email" }],
      },
    },
    error: null,
  });
  serverClient.auth.getSession.mockResolvedValue({
    data: { session: { expires_at: 1_800_000_000 } },
  });
  serverClient.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: "aal2" },
  });
});

describe("currentUser", () => {
  it("reduces the provider's user to the fields the gate needs", async () => {
    const user = await supabaseAuthDriver().currentUser();
    expect(user).toEqual({
      id: "u-1",
      email: "someone@example.test",
      hasPassword: true,
      aal: "aal2",
      expiresAtEpochSeconds: 1_800_000_000,
    });
  });

  it("reports no password when there is no email identity (ADR-042)", async () => {
    serverClient.auth.getUser.mockResolvedValue({
      data: { user: { id: "u-2", email: null, identities: [] } },
      error: null,
    });
    const user = await supabaseAuthDriver().currentUser();
    expect(user?.hasPassword).toBe(false);
  });

  it("is null when the provider says the session is not valid (a 4xx)", async () => {
    serverClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", status: 401, message: "jwt expired" },
    });
    expect(await supabaseAuthDriver().currentUser()).toBeNull();
  });

  it("fails closed to aal null — never mfaVerified — when the assurance level cannot be read", async () => {
    serverClient.auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(
      new Error("offline"),
    );
    const user = await supabaseAuthDriver().currentUser();
    expect(user?.aal).toBeNull();
  });
});

describe("roleOf", () => {
  it("reads user_roles through the session-scoped client (RLS: own row)", async () => {
    serverClient.from.mockReturnValue(
      chain({ data: { role: "nanny" }, error: null }),
    );
    expect(await supabaseAuthDriver().roleOf("u-1")).toBe("nanny");
    expect(serverClient.from).toHaveBeenCalledWith("user_roles");
    expect(elevated.from).not.toHaveBeenCalled();
  });

  it("is null when no row exists", async () => {
    serverClient.from.mockReturnValue(chain({ data: null, error: null }));
    expect(await supabaseAuthDriver().roleOf("u-1")).toBeNull();
  });

  it("throws on a driver error so the port maps it once", async () => {
    serverClient.from.mockReturnValue(
      chain({ data: null, error: { message: "relation does not exist" } }),
    );
    await expect(supabaseAuthDriver().roleOf("u-1")).rejects.toThrow();
  });
});

describe("the named service-role uses (01 §6.3)", () => {
  it("writeRole goes through the elevated client, never the session one", async () => {
    elevated.from.mockReturnValue(chain({ data: null, error: null }));
    await supabaseAuthDriver().writeRole("u-1", "parent");
    expect(elevated.from).toHaveBeenCalledWith("user_roles");
    expect(serverClient.from).not.toHaveBeenCalled();
  });

  it("createSignedUrl goes through the elevated client (the buckets have no user SELECT policy)", async () => {
    elevated.storage.from.mockReturnValue({
      createSignedUrl: vi.fn(async () => ({
        data: { signedUrl: "https://signed.test/x" },
        error: null,
      })),
    });
    const url = await supabaseAuthDriver().createSignedUrl(
      { bucket: "verification-documents", path: "u-1/identity/a.pdf" },
      3600,
    );
    expect(url).toBe("https://signed.test/x");
    expect(elevated.storage.from).toHaveBeenCalledWith(
      "verification-documents",
    );
  });

  it("query('service') reaches the elevated client and query() the session one", async () => {
    elevated.rpc.mockResolvedValue({ data: 1, error: null });
    serverClient.rpc.mockResolvedValue({ data: 2, error: null });
    const driver = supabaseAuthDriver();
    expect(await driver.query("service").rpc("f" as never, {} as never)).toBe(
      1,
    );
    expect(await driver.query("session").rpc("f" as never, {} as never)).toBe(
      2,
    );
  });
});

describe("the narrow Query surface (03 §1.4)", () => {
  it("select, insert and update all go through the scoped client and unwrap the row", async () => {
    const node = chain({ data: [{ id: 1 }], error: null });
    serverClient.from.mockReturnValue(node);
    const q = supabaseAuthDriver().query("session");
    expect(await q.from("user_roles" as never).select()).toEqual([{ id: 1 }]);
    expect(
      await q.from("user_roles" as never).select(["role"] as never),
    ).toEqual([{ id: 1 }]);
    await q.from("user_roles" as never).insert({} as never);
    await q.from("user_roles" as never).update("id-1" as never, {} as never);
    expect(node.insert).toHaveBeenCalled();
    expect(node.update).toHaveBeenCalled();
  });

  it("throws the driver's message so `run` can turn it into one INTERNAL", async () => {
    serverClient.from.mockReturnValue(
      chain({ data: null, error: { message: "permission denied" } }),
    );
    await expect(
      supabaseAuthDriver()
        .query("session")
        .from("user_roles" as never)
        .select(),
    ).rejects.toThrow("permission denied");
  });
});

describe("credential calls surface provider failures as throws, never as a null user", () => {
  it("signInWithPassword throws on an error", async () => {
    serverClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });
    await expect(
      supabaseAuthDriver().signInWithPassword({
        email: "a@b.test" as never,
        password: "x",
      }),
    ).rejects.toThrow();
  });

  it("signUp throws when the provider returns no user", async () => {
    serverClient.auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
    await expect(
      supabaseAuthDriver().signUpWithPassword({
        email: "a@b.test" as never,
        password: "x",
        role: "parent",
      }),
    ).rejects.toThrow();
  });

  it("updatePassword throws on an error", async () => {
    serverClient.auth.updateUser.mockResolvedValue({
      error: { message: "weak password" },
    });
    await expect(supabaseAuthDriver().updatePassword("x")).rejects.toThrow();
  });

  it("signOut resolves when the provider is happy", async () => {
    serverClient.auth.signOut.mockResolvedValue({ error: null });
    await expect(supabaseAuthDriver().signOut()).resolves.toBeUndefined();
  });

  it("exchangeCodeForSession returns the user it was given", async () => {
    serverClient.auth.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { id: "u-9", email: "x@y.test" },
        session: { expires_at: 1 },
      },
      error: null,
    });
    const user = await supabaseAuthDriver().exchangeCodeForSession("code");
    expect(user.id).toBe("u-9");
  });
});
