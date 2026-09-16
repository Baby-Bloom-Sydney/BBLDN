// A boot-time registration slot, the same shape `platform` uses (03 §9.5): the module-level `auth` binding reads
// its implementation from here. The value is never mutated — it is replaced.
import type { AppDatabase, Auth } from "../types";

export const AUTH_REGISTRY = (() => {
  const slot: { current: Auth<AppDatabase> | null } = { current: null };
  return Object.freeze({
    get: (): Auth<AppDatabase> | null => slot.current,
    set: (next: Auth<AppDatabase> | null): void => {
      slot.current = next;
    },
  });
})();
