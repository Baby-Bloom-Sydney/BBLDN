// The current `biometric-notice` document for S-N-05's gate and S-N-10 (02 §4.1 `legal_documents`, anon SELECT):
// the newest version's body, rendered as plain text by the component (07 §4.3: no unsanitised HTML). `null`
// when nothing is seeded yet — the migration set ships no bodies (02 §6 row 0003; Phase 3 seeds them).
import { auth } from "@/modules/auth";
import { log } from "@/modules/platform";
import type { BiometricNotice } from "../types";

type Row = { readonly version: number; readonly body_md: string };

export async function loadBiometricNotice(): Promise<BiometricNotice | null> {
  const read = await auth.data.run<BiometricNotice | null>({
    name: "verification.readBiometricNotice",
    exec: async (q) => {
      const rows = (await q
        .from("legal_documents")
        .eq("document_id", "biometric-notice")
        .select()) as ReadonlyArray<Row>;
      const newest = [...rows].sort((a, b) => b.version - a.version)[0];
      return newest === undefined
        ? null
        : { version: newest.version, body: newest.body_md };
    },
  });
  if (read.ok) return read.value;
  log.warn("biometric notice read refused", {
    module: "verification",
    action: "loadBiometricNotice",
    reason: read.error.details?.reason ?? read.error.code,
  });
  return null;
}
