"use client";

// The cookie banner (FATE `10.22` / `01.07`; ADR-175; L-009 `3g`). `3c` ruled its shape and left the surface
// owed; this is the surface, and each of ADR-175's three parts is visible in it:
//
//   **(a) Nothing pre-ticked but strictly necessary.** There is nothing to tick here at all. The essential
//   cookies are *stated* — sign-in, this preference cookie, request routing — and the two optional categories
//   are named, so "Accept" is informed rather than a shrug. Choosing per category is one link away and,
//   crucially, is not the only way to say no.
//
//   **(b) Reject is one action at the same level as accept.** Same element, same row, same size, same weight,
//   no second screen, and no colour trick that makes one read as the way out. It records a row exactly as an
//   accept does (`reject_non_essential`, both flags false): PECR needs us to be able to show she was asked and
//   declined, and without the row the banner would ask again on every page, which is a dark pattern by accident.
//
//   **(c) Nothing non-essential has loaded while she is looking at this.** Not this component's doing —
//   `ConsentGate` is what holds the trackers out of the document, and this banner is what ends that state. The
//   two meet at the preference cookie the server sets on a recorded choice.
//
// **The banner does not lie about what happened.** The Sydney one hid itself the instant a button was pressed,
// wrote the preference cookie from the browser, and fired the POST into a `catch {}` — so a refused write looked
// exactly like a recorded one. Here it closes only when the server says the row exists; a failure keeps it open
// and says so, because the alternative is a person who believes she declined and a database that never heard.
import { useEffect, useState } from "react";
import { readConsentPreference } from "@/lib/legal/read-consent-preference";
import { postCookieChoice } from "@/lib/legal/post-cookie-choice";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Read in an effect, never during render: there is no `document` on the server, and a banner whose visibility
  // differed between the server HTML and the first client render would flash for every visitor who has answered.
  useEffect(() => {
    setVisible(readConsentPreference() === null);
  }, []);

  if (!visible) return null;

  const choose = async (acceptAll: boolean) => {
    setSaving(true);
    setFailed(false);
    const recorded = await postCookieChoice(
      acceptAll
        ? {
            choice: "accept_all",
            analyticsEnabled: true,
            marketingEnabled: true,
          }
        : {
            choice: "reject_non_essential",
            analyticsEnabled: false,
            marketingEnabled: false,
          },
    );
    setSaving(false);
    if (recorded) setVisible(false);
    else setFailed(true);
  };

  return (
    <section
      aria-labelledby="cookie-banner-heading"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-violet-100 bg-white/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1">
          <h2
            id="cookie-banner-heading"
            className="text-sm font-semibold text-slate-900"
          >
            Cookies on this site
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Some cookies are needed to sign you in, to remember this choice and
            to route your request — those are always on. We would also like to
            use analytics and marketing cookies, and we only do that if you say
            yes. You can change your mind at any time.{" "}
            <a
              href="/legal/cookies"
              className="text-violet-600 underline underline-offset-2 hover:text-violet-700"
            >
              Cookie policy
            </a>
          </p>
          {failed && (
            <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
              We could not record that choice. Please try again.
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {/* Same element, same size, same weight — ADR-175 (b). The order follows the reading order of the
              sentence above; neither is styled as the easier one. */}
          <button
            type="button"
            disabled={saving}
            onClick={() => void choose(true)}
            className="rounded-md border border-violet-600 bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-60"
          >
            Accept all
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void choose(false)}
            className="rounded-md border border-violet-600 bg-white px-4 py-2 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-60"
          >
            Reject non-essential
          </button>
          <a
            href="/legal/cookies#preferences"
            className="rounded-md px-3 py-2 text-center text-xs font-medium text-slate-600 underline underline-offset-2 transition-colors hover:text-violet-700"
          >
            Choose by category
          </a>
        </div>
      </div>
    </section>
  );
}
