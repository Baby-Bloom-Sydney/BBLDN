// The banner's behaviour, judged against ADR-175 (b) and against the failure mode the Sydney one had
// (L-009 `3g`).
//
// Two of these cases are the ones that would have caught the old component: a reject must post a **row** with
// the same weight as an accept, and a write the server refused must leave the banner open rather than closing
// it over nothing.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECURITY } from "@/modules/config";
import { CookieConsentBanner } from "./CookieConsentBanner";

const COOKIE = SECURITY.consentPreferenceCookie.name;

function setPreference(value: string | null) {
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
  if (value !== null) document.cookie = `${COOKIE}=${value}; path=/`;
}

/** The server's answer, and the cookie it would have set with it. */
function serverAccepts(ok: boolean, writes?: string) {
  return vi.fn(async () => {
    if (ok && writes !== undefined) setPreference(writes);
    return { ok, json: async () => ({ ok }) } as Response;
  });
}

beforeEach(() => setPreference(null));
afterEach(() => {
  setPreference(null);
  vi.unstubAllGlobals();
});

describe("CookieConsentBanner — when it is shown", () => {
  it("is shown when no choice has been recorded", async () => {
    render(<CookieConsentBanner />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /cookies/i })).toBeTruthy(),
    );
  });

  it("is not shown once a choice exists — including a reject, which is why the row matters", async () => {
    setPreference("reject_non_essential.00");
    render(<CookieConsentBanner />);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /cookies/i })).toBeNull(),
    );
  });
});

describe("CookieConsentBanner — ADR-175 (b): reject is a first-class action", () => {
  it("offers accept and reject as the same kind of control, at the same level", async () => {
    render(<CookieConsentBanner />);
    const accept = await screen.findByRole("button", { name: /accept all/i });
    const reject = await screen.findByRole("button", {
      name: /reject non-essential/i,
    });
    // Same element and same type: neither is a link, a footnote, or behind a second screen.
    expect(accept.tagName).toBe(reject.tagName);
    expect(accept.getAttribute("type")).toBe(reject.getAttribute("type"));
  });

  it("★ a reject writes a row exactly as an accept does", async () => {
    const fetchMock = serverAccepts(true, "reject_non_essential.00");
    vi.stubGlobal("fetch", fetchMock);
    render(<CookieConsentBanner />);

    await userEvent.click(
      await screen.findByRole("button", { name: /reject non-essential/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/legal/cookie-consent");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      consent_choice: "reject_non_essential",
      analytics_enabled: false,
      marketing_enabled: false,
    });
  });

  it("an accept posts both flags on", async () => {
    const fetchMock = serverAccepts(true, "accept_all.11");
    vi.stubGlobal("fetch", fetchMock);
    render(<CookieConsentBanner />);

    await userEvent.click(
      await screen.findByRole("button", { name: /accept all/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(init.body))).toEqual({
      consent_choice: "accept_all",
      analytics_enabled: true,
      marketing_enabled: true,
    });
  });

  it("sends the signed visitor cookie, or a second choice would supersede nothing", async () => {
    const fetchMock = serverAccepts(true, "accept_all.11");
    vi.stubGlobal("fetch", fetchMock);
    render(<CookieConsentBanner />);
    await userEvent.click(
      await screen.findByRole("button", { name: /accept all/i }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.credentials).toBe("same-origin");
  });
});

describe("CookieConsentBanner — it does not lie about what was recorded", () => {
  it("closes once the server says the row exists", async () => {
    vi.stubGlobal("fetch", serverAccepts(true, "accept_all.11"));
    render(<CookieConsentBanner />);
    await userEvent.click(
      await screen.findByRole("button", { name: /accept all/i }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /cookies/i })).toBeNull(),
    );
  });

  it("★ stays open and says so when the write was refused — the Sydney banner closed here", async () => {
    vi.stubGlobal("fetch", serverAccepts(false));
    render(<CookieConsentBanner />);
    await userEvent.click(
      await screen.findByRole("button", { name: /reject non-essential/i }),
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("heading", { name: /cookies/i })).toBeTruthy();
  });

  it("stays open when the network is gone, rather than throwing at a person pressing Reject", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    render(<CookieConsentBanner />);
    await userEvent.click(
      await screen.findByRole("button", { name: /reject non-essential/i }),
    );
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});
