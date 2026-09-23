"use client";

// **The Meta pixel, and the only file allowed to load it** (`4c`; `02.25` / `11.34`; ADR-055; ADR-175 (c)).
//
// It is mounted in exactly one place — inside `<ConsentGate category="marketing">` in `app/layout.tsx` — and
// `consent-gate.repo.test.ts` is what makes that the only option rather than the recommended one. `3g` built
// that gate after `<Analytics />` was found mounted unconditionally in the root layout, which made the
// banner's Reject button mean nothing; this component hangs on the same gate and adds no second mechanism of
// its own. There is deliberately no consent check inside this file: two gates disagreeing is worse than one
// gate, and the one that already exists is the one with the proof suite.
//
// **Nothing happens at import time.** The module is imported by the root layout on every render, including for
// a visitor who has not chosen, so a module-level `fbq` bootstrap or script append would defeat the gate from
// inside the file the gate wraps. Every effect below runs only once React has mounted the component, which it
// does only when `ConsentGate` says marketing consent exists.
//
// **It renders `null`.** No script element in the markup, and — deliberately — none of the no-JavaScript
// fallback image from Meta's copy-paste snippet. That fallback is an image tag in the server's HTML, so it
// would fetch for every visitor before any JavaScript ran: the precise thing this gate exists to prevent, and
// the one part of the vendor snippet that cannot be gated at all.
//
// **Withdrawal actually withdraws** (Art 7(3)). A script element removed from the DOM does not unload the
// library it already ran, so unmounting alone would leave a live tracker behind — the cleanup calls
// `fbq('consent', 'revoke')` and expires the identifiers the pixel stored (`_fbp`, `_fbc`). A tracker that
// survives until the next navigation is not withdrawal.
//
// **The pixel id is config and may not exist yet.** `NEXT_PUBLIC_META_PIXEL_ID` is `—` in dev and preview, so
// `META.pixelId` is `undefined` until BAI provides it, and this component then loads nothing at all rather
// than initialising against a placeholder.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { META } from "@/modules/config";

/**
 * The vendor's global. Typed here rather than `any` (no `any` in application code): the queue, `callMethod`,
 * `loaded` and `version` are the fields the loader reads off the stub it finds, so they are the contract.
 */
type Fbq = ((...args: ReadonlyArray<unknown>) => void) & {
  queue?: Array<ReadonlyArray<unknown>>;
  callMethod?: (...args: ReadonlyArray<unknown>) => void;
  loaded?: boolean;
  version?: string;
  push?: unknown;
};

type PixelWindow = Window & { fbq?: Fbq; _fbq?: Fbq };

const STUB_VERSION = "2.0";
/** The identifiers the pixel stores on the device; expired on withdrawal. */
const PIXEL_COOKIES = ["_fbp", "_fbc"] as const;

function installStub(target: PixelWindow): Fbq {
  const existing = target.fbq;
  if (existing !== undefined) return existing;
  const queue: Array<ReadonlyArray<unknown>> = [];
  const fbq: Fbq = (...args) => {
    if (fbq.callMethod !== undefined) fbq.callMethod(...args);
    else queue.push(args);
  };
  fbq.queue = queue;
  fbq.loaded = true;
  fbq.version = STUB_VERSION;
  fbq.push = fbq;
  target.fbq = fbq;
  target._fbq = fbq;
  return fbq;
}

function expirePixelCookies() {
  for (const name of PIXEL_COOKIES)
    document.cookie = `${name}=; path=/; max-age=0`;
}

export function MetaPixel() {
  const pathname = usePathname();
  const pixelId = META.pixelId;

  useEffect(() => {
    if (pixelId === undefined) return;
    const target = window as PixelWindow;
    const fbq = installStub(target);
    const script = document.createElement("script");
    script.async = true;
    script.src = META.scriptSrc;
    document.head.appendChild(script);
    fbq("init", pixelId);
    return () => {
      fbq("consent", "revoke");
      expirePixelCookies();
      script.remove();
    };
  }, [pixelId]);

  // A separate effect, keyed on the path: the loader must run once, and the page view must run on every
  // client-side navigation — the App Router does not reload the document, so one effect doing both would
  // either re-append the script or report a single page view for a whole visit.
  useEffect(() => {
    if (pixelId === undefined) return;
    (window as PixelWindow).fbq?.("track", META.pageViewEvent);
  }, [pixelId, pathname]);

  return null;
}
