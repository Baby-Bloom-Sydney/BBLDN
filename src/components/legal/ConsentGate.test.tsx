// **The no-script-before-a-choice proof** (ADR-175 (c); 07 §10.3 "fix: S-10"; L-009 `3g`).
//
// The claim the merge rests on is narrow and testable: *no non-essential script is in the document until a
// choice exists*. The CSP cannot carry it — 07 §10.3 says the Meta origins are allow-listed statically — so the
// claim rests entirely on this component, and this suite is what makes it a claim rather than a comment.
//
// It is asserted twice, because there are two documents:
//
//   1. **The server's HTML**, via `renderToStaticMarkup`. This is the byte stream a visitor receives before any
//      of our JavaScript runs, and a `<script src=…>` in it would have been fetched before the banner existed.
//      It must contain no child, and — the harder half — it must contain no child *even when a valid consent
//      cookie is present*, because the server render has no access to `document.cookie` and must therefore be
//      pessimistic rather than guess.
//   2. **The hydrated page**, via `render`, across the four states a visitor can be in: no cookie, a rejected
//      choice, an accepted one, and a malformed one.
import { render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { SECURITY } from "@/modules/config";
import { announceConsentChanged } from "@/lib/legal/consent-changed-event";
import { ConsentGate } from "./ConsentGate";

const COOKIE = SECURITY.consentPreferenceCookie.name;

/**
 * Something unmistakably non-essential: a real tracker URL on an allow-listed CSP origin (07 §10.3). `async`
 * because that is how a pixel loader is actually written — and because the sync-script lint rule is right, and
 * a fixture that needs a rule disabled is a fixture that does not match what it stands for.
 */
const Pixel = () => (
  <script
    async
    data-testid="pixel"
    src="https://connect.facebook.net/en_US/fbevents.js"
  />
);

function setPreference(value: string | null) {
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
  if (value !== null) document.cookie = `${COOKIE}=${value}; path=/`;
}

afterEach(() => setPreference(null));

describe("ConsentGate — the server's HTML", () => {
  it("★ contains no gated script, so nothing is fetched before the banner is even drawn", () => {
    const html = renderToStaticMarkup(
      <ConsentGate category="marketing">
        <Pixel />
      </ConsentGate>,
    );
    expect(html).toBe("");
    expect(html).not.toContain("connect.facebook.net");
  });

  it("contains no gated script even with a valid accept cookie set — the server does not guess", () => {
    setPreference("accept_all.11");
    const html = renderToStaticMarkup(
      <ConsentGate category="marketing">
        <Pixel />
      </ConsentGate>,
    );
    expect(html).toBe("");
  });
});

describe("ConsentGate — the hydrated page", () => {
  it("★ mounts nothing when no choice has been made — 'no answer' is not consent", async () => {
    render(
      <ConsentGate category="marketing">
        <Pixel />
      </ConsentGate>,
    );
    await waitFor(() => expect(document.cookie).not.toContain(COOKIE));
    expect(screen.queryByTestId("pixel")).toBeNull();
  });

  it("mounts nothing when the choice was to reject", async () => {
    setPreference("reject_non_essential.00");
    render(
      <ConsentGate category="marketing">
        <Pixel />
      </ConsentGate>,
    );
    await waitFor(() => expect(screen.queryByTestId("pixel")).toBeNull());
  });

  it("mounts nothing when the cookie is malformed — an unreadable answer is no answer", async () => {
    setPreference("accept_all.1x");
    render(
      <ConsentGate category="marketing">
        <Pixel />
      </ConsentGate>,
    );
    await waitFor(() => expect(screen.queryByTestId("pixel")).toBeNull());
  });

  it("mounts the script once the choice says yes", async () => {
    setPreference("accept_all.11");
    render(
      <ConsentGate category="marketing">
        <Pixel />
      </ConsentGate>,
    );
    await waitFor(() => expect(screen.getByTestId("pixel")).toBeTruthy());
  });

  it("gates the two categories apart: analytics on, marketing off", async () => {
    setPreference("custom.10");
    render(
      <>
        <ConsentGate category="analytics">
          <span data-testid="analytics" />
        </ConsentGate>
        <ConsentGate category="marketing">
          <Pixel />
        </ConsentGate>
      </>,
    );
    await waitFor(() => expect(screen.getByTestId("analytics")).toBeTruthy());
    expect(screen.queryByTestId("pixel")).toBeNull();
  });
});

describe("ConsentGate — a choice moves it both ways (Art 7(3))", () => {
  it("mounts on an accept announced after the first read, without a reload", async () => {
    render(
      <ConsentGate category="marketing">
        <Pixel />
      </ConsentGate>,
    );
    await waitFor(() => expect(screen.queryByTestId("pixel")).toBeNull());

    setPreference("accept_all.11");
    announceConsentChanged();

    await waitFor(() => expect(screen.getByTestId("pixel")).toBeTruthy());
  });

  it("★ unmounts on a withdrawal — a tracker that survives until the next navigation is not withdrawal", async () => {
    setPreference("accept_all.11");
    render(
      <ConsentGate category="marketing">
        <Pixel />
      </ConsentGate>,
    );
    await waitFor(() => expect(screen.getByTestId("pixel")).toBeTruthy());

    setPreference("reject_non_essential.00");
    announceConsentChanged();

    await waitFor(() => expect(screen.queryByTestId("pixel")).toBeNull());
  });
});
