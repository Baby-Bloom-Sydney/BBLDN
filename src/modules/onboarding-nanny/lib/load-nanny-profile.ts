// The nanny's own rows for S-N-18 / S-N-19 prefill and the hub (05 §7 rule 5 — the route file is thin). A read
// that refused is `null` here as well: the screens treat "no row" and "could not read" the same way (a fresh
// account with nothing to show) and the refusal is logged where it happened.
import { log } from "@/modules/platform";
import type { NannyProfile } from "../types";
import { nannyAccountStore } from "./default-nanny-account-store";

export async function loadNannyProfile(): Promise<NannyProfile | null> {
  const read = await nannyAccountStore.get();
  if (read.ok) return read.value;
  if (read.error.code !== "UNAUTHENTICATED")
    log.warn("nanny profile read refused", {
      module: "onboarding-nanny",
      action: "loadNannyProfile",
      cause: read.error,
    });
  return null;
}
