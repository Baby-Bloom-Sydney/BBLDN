// Every `@/modules/…` specifier one module may write, in a stable order so the generated file only changes
// when the table does: the universals it may read (01 §2.2, with `config`'s second entry point — §3.3), the
// four service modules (01 §2.4; not for a service or a universal, which are leaves), the rest of its §2.3
// row, then its own inside at any depth (a module's sub-modules are its own business — 01 §2.5).
import type { ModuleName } from "../module-name.ts";
import { ALLOWED_IMPORTS } from "../allowed-imports.ts";
import { EXTRA_ENTRY_POINTS } from "../extra-entry-points.ts";
import { SERVICE_MODULES } from "../service-modules.ts";
import { UNIVERSAL_MODULES } from "../universal-modules.ts";

const specifierOf = (name: string): string => `@/modules/${name}`;

const entryPointsOf = (name: string): readonly string[] => [
  specifierOf(name),
  ...(EXTRA_ENTRY_POINTS[name] ?? []).map(
    (entry) => `${specifierOf(name)}/${entry}`,
  ),
];

export function allowedSpecifiers(module: ModuleName): readonly string[] {
  const universalIndex = (UNIVERSAL_MODULES as readonly string[]).indexOf(
    module,
  );
  const isUniversal = universalIndex !== -1;
  const isLeaf =
    isUniversal || (SERVICE_MODULES as readonly string[]).includes(module);

  const universals = isUniversal
    ? UNIVERSAL_MODULES.slice(universalIndex + 1)
    : UNIVERSAL_MODULES;
  const services = isLeaf ? [] : [...SERVICE_MODULES].sort();
  const covered = new Set<string>([...universals, ...services, module]);
  const row = [...ALLOWED_IMPORTS[module]]
    .filter((target) => !covered.has(target))
    .sort();

  return [
    ...universals.flatMap(entryPointsOf),
    ...services.map(specifierOf),
    ...row.map(specifierOf),
    specifierOf(module),
    `${specifierOf(module)}/**`,
  ];
}
