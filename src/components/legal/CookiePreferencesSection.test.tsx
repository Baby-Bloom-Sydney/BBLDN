// The preference screen, judged against ADR-175 (a) (L-009 `3g`).
//
// The headline case is the first one: **a visitor who has never been asked sees both toggles off.** The Sydney
// screen showed them on, so a person arriving at the cookie policy page and pressing Save recorded an
// `accept_all` she had never given — a pre-ticked box that writes a record, which is the exact thing PECR reg 6
// and Art 4(11) forbid.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CookiePreferencesSection } from "./CookiePreferencesSection";

/** The `GET` answer, in 01 §4c's envelope. */
function serverHolds(
  data: Record<string, unknown> | null,
  post: { ok: boolean } = { ok: true },
) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST")
      return { ok: post.ok, json: async () => ({ ok: post.ok }) } as Response;
    return {
      ok: true,
      json: async () => ({
        ok: true,
        data: data ?? {
          choice: null,
          analyticsEnabled: false,
          marketingEnabled: false,
        },
      }),
    } as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("CookiePreferencesSection — ADR-175 (a): nothing pre-ticked", () => {
  it("★ shows both optional toggles OFF when nothing has been recorded", async () => {
    vi.stubGlobal("fetch", serverHolds(null));
    render(<CookiePreferencesSection />);

    const analytics = await screen.findByRole("switch", {
      name: /analytics/i,
    });
    const marketing = await screen.findByRole("switch", {
      name: /marketing/i,
    });
    await waitFor(() =>
      expect(analytics.getAttribute("aria-checked")).toBe("false"),
    );
    expect(marketing.getAttribute("aria-checked")).toBe("false");
  });

  it("shows both off when the read fails — it never displays a consent it cannot evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    render(<CookiePreferencesSection />);
    const analytics = await screen.findByRole("switch", { name: /analytics/i });
    await waitFor(() =>
      expect(analytics.getAttribute("aria-checked")).toBe("false"),
    );
  });

  it("offers no control at all for the essential cookies — they are stated, not offered", async () => {
    vi.stubGlobal("fetch", serverHolds(null));
    render(<CookiePreferencesSection />);
    await waitFor(() => expect(screen.getAllByRole("switch")).toHaveLength(2));
    expect(screen.getByText("Always on")).toBeTruthy();
  });
});

describe("CookiePreferencesSection — it shows the record, not a default", () => {
  it("fills the toggles in from what is on record", async () => {
    vi.stubGlobal(
      "fetch",
      serverHolds({
        choice: "custom",
        analyticsEnabled: true,
        marketingEnabled: false,
      }),
    );
    render(<CookiePreferencesSection />);
    const analytics = await screen.findByRole("switch", { name: /analytics/i });
    await waitFor(() =>
      expect(analytics.getAttribute("aria-checked")).toBe("true"),
    );
    expect(
      screen
        .getByRole("switch", { name: /marketing/i })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });
});

describe("CookiePreferencesSection — saving", () => {
  it("posts the choice the two toggles add up to", async () => {
    const fetchMock = serverHolds(null);
    vi.stubGlobal("fetch", fetchMock);
    render(<CookiePreferencesSection />);

    await userEvent.click(
      await screen.findByRole("switch", { name: /analytics/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /save preferences/i }),
    );

    await waitFor(() => {
      const posted = fetchMock.mock.calls.find(
        (call) => (call[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(posted).toBeTruthy();
      expect(JSON.parse(String((posted?.[1] as RequestInit).body))).toEqual({
        consent_choice: "custom",
        analytics_enabled: true,
        marketing_enabled: false,
      });
    });
  });

  it("★ a withdrawal is one press of the same button — turning both off posts a reject", async () => {
    const fetchMock = serverHolds({
      choice: "accept_all",
      analyticsEnabled: true,
      marketingEnabled: true,
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CookiePreferencesSection />);

    const analytics = await screen.findByRole("switch", { name: /analytics/i });
    await waitFor(() =>
      expect(analytics.getAttribute("aria-checked")).toBe("true"),
    );
    await userEvent.click(analytics);
    await userEvent.click(screen.getByRole("switch", { name: /marketing/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /save preferences/i }),
    );

    await waitFor(() => {
      const posted = fetchMock.mock.calls.find(
        (call) => (call[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(JSON.parse(String((posted?.[1] as RequestInit).body))).toEqual({
        consent_choice: "reject_non_essential",
        analytics_enabled: false,
        marketing_enabled: false,
      });
    });
  });

  it("says so when the save was refused, rather than showing 'saved' over nothing", async () => {
    vi.stubGlobal("fetch", serverHolds(null, { ok: false }));
    render(<CookiePreferencesSection />);
    await screen.findByRole("switch", { name: /analytics/i });
    await userEvent.click(
      screen.getByRole("button", { name: /save preferences/i }),
    );
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});
