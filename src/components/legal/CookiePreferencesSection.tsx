"use client";

// The per-category preference screen (FATE `10.22`; ADR-175 (a); L-009 `3g`).
//
// **The defect this replaces is the one ADR-175 (a) is written about.** The Sydney screen was
// `useState(true)` / `useState(true)`: a visitor who had never been asked arrived at two ticked boxes, and
// pressing Save recorded an `accept_all` she had never given. A pre-ticked box is not freely-given consent
// (PECR reg 6 / UK GDPR Art 4(11)), and a pre-ticked box that *writes a record* is worse than a cosmetic one.
// Both toggles now start **off** and are filled in from the record — never from a default, and never from the
// browser's copy of it.
//
// **It reads the row, not the cookie** (`fetch-cookie-choice.ts`). The screen whose job is to tell a person what
// we hold should show what we hold; a cleared jar, a second device or a lapsed window would otherwise show her
// something we cannot evidence. Until that read returns, the toggles are off and Save is disabled, so there is
// no window in which the screen invites a click on a state it has not confirmed.
//
// **Withdrawal is one press of the same button as consent** (Art 7(3)). Turning a toggle off and saving writes a
// new row with the flag false; the append-only road supersedes the previous answer, and `ConsentGate` unmounts
// what that answer had allowed — without a reload, because `postCookieChoice` announces the change.
import { useEffect, useState } from "react";
import { choiceForFlags } from "@/lib/legal/choice-for-flags";
import { fetchCookieChoice } from "@/lib/legal/fetch-cookie-choice";
import { postCookieChoice } from "@/lib/legal/post-cookie-choice";

type Saved = "idle" | "saving" | "saved" | "failed";

export function CookiePreferencesSection() {
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<Saved>("idle");

  useEffect(() => {
    let live = true;
    void fetchCookieChoice().then((preference) => {
      if (!live) return;
      // `null` — never chosen, lapsed, or a read we could not complete — leaves both toggles off. The safe
      // direction in both senses: it never displays a consent we cannot evidence, and it never pre-ticks.
      setAnalytics(preference?.analyticsEnabled ?? false);
      setMarketing(preference?.marketingEnabled ?? false);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const save = async () => {
    setState("saving");
    const recorded = await postCookieChoice({
      choice: choiceForFlags(analytics, marketing),
      analyticsEnabled: analytics,
      marketingEnabled: marketing,
    });
    setState(recorded ? "saved" : "failed");
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="space-y-4">
        <EssentialRow />
        <div className="border-t border-slate-200" />
        <ToggleRow
          label="Analytics cookies"
          description="Help us understand how visitors use the site, so we can make it work better."
          checked={analytics}
          disabled={!loaded}
          onChange={setAnalytics}
        />
        <div className="border-t border-slate-200" />
        <ToggleRow
          label="Marketing cookies"
          description="Let us measure whether our advertising reaches the families and professionals it is meant for."
          checked={marketing}
          disabled={!loaded}
          onChange={setMarketing}
        />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!loaded || state === "saving"}
          className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-60"
        >
          Save preferences
        </button>
        {state === "saved" && (
          <span className="text-xs font-medium text-emerald-600">
            Preferences saved
          </span>
        )}
        {state === "failed" && (
          <span role="alert" className="text-xs font-medium text-rose-600">
            We could not save that. Please try again.
          </span>
        )}
      </div>
    </div>
  );
}

/** Stated, not offered — ADR-175 (a). There is no control here because there is no choice to make. */
function EssentialRow() {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">Essential cookies</p>
        <p className="text-xs text-slate-500">
          Needed to sign you in, to remember this choice and to route your
          request. They are always on, and we do not ask for consent to them.
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600">
        Always on
      </span>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-50 ${
          checked ? "bg-violet-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
