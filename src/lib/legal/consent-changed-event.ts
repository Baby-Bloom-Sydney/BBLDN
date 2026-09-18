// The one signal that says "a cookie choice was just recorded" (L-009 `3g`).
//
// It exists because of what the gate must not do. `ConsentGate` reads the preference cookie once, in an effect,
// and starts "not granted" — so without a signal, accepting analytics would mount nothing until the visitor
// happened to navigate, and rejecting after accepting would leave a tracker mounted for the rest of the session.
// Polling `document.cookie` would work and is the wrong shape: it would run forever to catch an event that
// happens at most a handful of times, and it would hide the fact that there is exactly one writer.
//
// A DOM event rather than a React context because the writer (the banner, or the preference screen, which live
// in different trees) and the readers (the gates in the root layout) have no common provider, and adding one
// would put a client boundary around the whole app.
const CONSENT_CHANGED = "bb:consent-changed";

export function announceConsentChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_CHANGED));
}

/** Returns the unsubscribe, so an effect can hand it straight back. */
export function onConsentChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_CHANGED, listener);
  return () => window.removeEventListener(CONSENT_CHANGED, listener);
}
