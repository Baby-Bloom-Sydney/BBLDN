// The three call types as the admin reads them (00-glossary §1.3; 04 §5.1). Visible text, not colour alone
// (04 §6.4 S-A-03 semantics: "type and priority as visible text").
import type { CallType } from "@/modules/shared-types";

export const CALL_TYPE_LABEL: Readonly<Record<CallType, string>> =
  Object.freeze({
    matchmaking: "Matchmaking",
    onboarding: "Onboarding",
    "nanny-commission": "Nanny commission",
  });
