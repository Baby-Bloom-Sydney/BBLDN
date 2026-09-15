// The one place a branded id is minted (shared-types/brand.ts: zero runtime, so a fresh uuid must be asserted
// into its brand exactly once — here). `newId<EventId>()`, `newId<ConsentRecordId>()` …; a DB-generated id is
// branded by the port that reads it, never by application code.
import type { Brand } from "@/modules/shared-types";

export const newId = <T extends Brand<string, string>>(): T =>
  crypto.randomUUID() as T;
