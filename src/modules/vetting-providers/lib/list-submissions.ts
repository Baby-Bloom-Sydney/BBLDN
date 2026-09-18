// The ledger read the wizard's processing step and the admin queue (2c) share (03 §4.3): which submissions a
// nanny / a section / a status has. Runs through whatever store boot installed — service scope in production,
// named in the README.
import type { Result } from "@/modules/shared-types";
import type {
  VettingErrorDetails,
  VettingLedgerEntry,
  VettingLedgerFilter,
} from "../types";
import { VETTING_STORE_REGISTRY } from "./vetting-store-registry";

export function listSubmissions(
  filter: VettingLedgerFilter,
): Promise<Result<ReadonlyArray<VettingLedgerEntry>, VettingErrorDetails>> {
  return VETTING_STORE_REGISTRY.get().list(filter);
}
