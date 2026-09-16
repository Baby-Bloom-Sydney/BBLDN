// `no-restricted-imports` matches its `group` with gitignore semantics — last match wins — so the whole module
// namespace is banned first (both the connector level and everything under it, which is what makes a deep
// import into another module's internals a failure) and the allowances are negations (05 §7 rules 1–2).
import type { ModuleName } from "../module-name.ts";
import { allowedSpecifiers } from "./allowed-specifiers.ts";

export function restrictedImportGroup(module: ModuleName): readonly string[] {
  return [
    "@/modules/*",
    "@/modules/*/**",
    ...allowedSpecifiers(module).map((specifier) => `!${specifier}`),
  ];
}
