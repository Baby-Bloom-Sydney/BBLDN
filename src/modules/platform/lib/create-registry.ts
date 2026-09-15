// A boot-time registration slot (03 §9.5 "registered at boot in src/instrumentation.ts"): the module-level
// `log` / `Events` / `consent` / `rateLimiter` / `uploadScanner` / `withUnitOfWork` read their implementation
// from one of these; the boot code sets it once. The value itself is never mutated — it is replaced.
import type { Registry } from "../types";

export function createRegistry<T>(initial: T): Registry<T> {
  const slot = { current: initial };
  return Object.freeze({
    get: () => slot.current,
    set: (next: T) => {
      slot.current = next;
    },
  });
}
