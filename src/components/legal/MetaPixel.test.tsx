// **The no-pixel-before-a-choice proof** (`4c`; ADR-055; ADR-175 (c); 07 §10.3 "fix: S-10").
//
// `ConsentGate.test.tsx` proves the gate holds a script out of the document; `consent-gate.repo.test.ts` proves
// this component is mounted nowhere but inside it. This suite proves the third thing neither of those can: that
// the component itself does nothing until React mounts it, and everything only then.
//
// It matters here more than it did for `<Analytics />`, because this loader is installed **by an effect**
// rather than by a rendered tag. An effect is invisible to a scan of the markup, so "the server's HTML is
// empty" — true, and asserted below — would on its own be a weaker claim than it sounds. The claim that
// actually protects a visitor is that **nothing is appended to the document and no vendor global exists**
// until a marketing choice says yes, and that is what the hydrated-page cases assert directly.
//
// The four states a visitor can be in are all here: no choice, rejected, analytics-only, accepted. So is the
// fifth state that is ours rather than hers — **no pixel id configured**, which is where London actually is
// until BAI provides `NEXT_PUBLIC_META_PIXEL_ID`, and in which the answer must be the same as a refusal.
import { render, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

/** Not a real id and never one: 08 §8 item 3 says the London dataset is not Sydney's, and a placeholder in the
 *  tree is how one becomes the other. Sixteen zeroes is unmistakably nobody's pixel. */
const TEST_PIXEL_ID = "0000000000000000";

let configuredPixelId: string | undefined = TEST_PIXEL_ID;

vi.mock("@/modules/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/config")>();
  return {
    ...actual,
    // A getter, so a test can change the answer between renders without re-importing the module.
    get META() {
      return { ...actual.META, pixelId: configuredPixelId };
    },
  };
});

const { SECURITY, META } = await import("@/modules/config");
const { ConsentGate } = await import("./ConsentGate");
const { MetaPixel } = await import("./MetaPixel");
const { announceConsentChanged } =
  await import("@/lib/legal/consent-changed-event");

const COOKIE = SECURITY.consentPreferenceCookie.name;

type FbqStub = { readonly queue?: ReadonlyArray<ReadonlyArray<unknown>> };

const fbq = (): FbqStub | undefined =>
  (window as unknown as { fbq?: FbqStub }).fbq;

const calls = (): ReadonlyArray<ReadonlyArray<unknown>> => fbq()?.queue ?? [];

const loaderScripts = (): ReadonlyArray<HTMLScriptElement> =>
  Array.from(document.querySelectorAll("script")).filter(
    (script) => script.src === META.scriptSrc,
  );

function setPreference(value: string | null) {
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
  if (value !== null) document.cookie = `${COOKIE}=${value}; path=/`;
}

const gated = () => (
  <ConsentGate category="marketing">
    <MetaPixel />
  </ConsentGate>
);

beforeEach(() => {
  configuredPixelId = TEST_PIXEL_ID;
});

afterEach(() => {
  setPreference(null);
  document.cookie = "_fbp=; path=/; max-age=0";
  for (const script of loaderScripts()) script.remove();
  delete (window as unknown as { fbq?: unknown }).fbq;
  delete (window as unknown as { _fbq?: unknown })._fbq;
});

describe("MetaPixel — the server's HTML", () => {
  it("★ contains no pixel, so nothing is fetched before the banner is even drawn", () => {
    const html = renderToStaticMarkup(gated());
    expect(html).toBe("");
    expect(html).not.toContain("connect.facebook.net");
    expect(html).not.toContain(TEST_PIXEL_ID);
  });

  it("contains no pixel even with a marketing-accept cookie set — the server does not guess", () => {
    setPreference("accept_all.11");
    expect(renderToStaticMarkup(gated())).toBe("");
  });

  it("renders no no-JavaScript fallback image, which no gate could hold back", () => {
    setPreference("accept_all.11");
    expect(renderToStaticMarkup(gated())).not.toContain("<img");
  });
});

describe("MetaPixel — the hydrated page", () => {
  it("★ appends nothing and defines no vendor global when no choice has been made", async () => {
    render(gated());
    await waitFor(() => expect(document.cookie).not.toContain(COOKIE));
    expect(loaderScripts()).toHaveLength(0);
    expect(fbq()).toBeUndefined();
  });

  it("★ appends nothing when the choice was to reject", async () => {
    setPreference("reject_non_essential.00");
    render(gated());
    await waitFor(() => expect(loaderScripts()).toHaveLength(0));
    expect(fbq()).toBeUndefined();
  });

  it("★ appends nothing when she accepted analytics but not marketing", async () => {
    setPreference("custom.10");
    render(gated());
    await waitFor(() => expect(loaderScripts()).toHaveLength(0));
    expect(fbq()).toBeUndefined();
  });

  it("appends nothing when the cookie is malformed — an unreadable answer is no answer", async () => {
    setPreference("accept_all.1x");
    render(gated());
    await waitFor(() => expect(loaderScripts()).toHaveLength(0));
  });

  it("★ loads the pixel once the choice says yes, and initialises it from config", async () => {
    setPreference("accept_all.11");
    render(gated());
    await waitFor(() => expect(loaderScripts()).toHaveLength(1));
    expect(loaderScripts()[0]?.async).toBe(true);
    expect(calls()).toContainEqual(["init", TEST_PIXEL_ID]);
    expect(calls()).toContainEqual(["track", META.pageViewEvent]);
  });

  it("★ loads nothing when no pixel id is configured — unconfigured denies, like a refusal", async () => {
    configuredPixelId = undefined;
    setPreference("accept_all.11");
    render(gated());
    await waitFor(() => expect(document.cookie).toContain(COOKIE));
    expect(loaderScripts()).toHaveLength(0);
    expect(fbq()).toBeUndefined();
  });
});

describe("MetaPixel — a choice moves it both ways (Art 7(3))", () => {
  it("mounts on an accept announced after the first read, without a reload", async () => {
    render(gated());
    await waitFor(() => expect(loaderScripts()).toHaveLength(0));

    setPreference("accept_all.11");
    announceConsentChanged();

    await waitFor(() => expect(loaderScripts()).toHaveLength(1));
  });

  it("★ revokes and clears the stored identifier on withdrawal — removing the tag alone would not", async () => {
    setPreference("accept_all.11");
    document.cookie = "_fbp=fb.1.1700000000000.1234567890; path=/";
    render(gated());
    await waitFor(() => expect(loaderScripts()).toHaveLength(1));

    setPreference("reject_non_essential.00");
    announceConsentChanged();

    await waitFor(() => expect(loaderScripts()).toHaveLength(0));
    expect(calls()).toContainEqual(["consent", "revoke"]);
    expect(document.cookie).not.toContain("_fbp=fb.1");
  });
});
