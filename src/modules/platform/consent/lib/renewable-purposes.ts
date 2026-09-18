// The purposes an annual renewal can be about: every purpose with a document behind it. `vaccination-status`
// (ADR-103) has none — it is a distinct explicit tick about a fact, not an acceptance of words — so it has
// nothing to re-ask against and is not renewable.
import type { LegalDocumentId } from "../types";
import { CONSENT_PURPOSES } from "./consent-purposes";

export const RENEWABLE_PURPOSES: ReadonlyArray<LegalDocumentId> = Object.freeze(
  CONSENT_PURPOSES.filter(
    (purpose): purpose is LegalDocumentId => purpose !== "vaccination-status",
  ),
);
