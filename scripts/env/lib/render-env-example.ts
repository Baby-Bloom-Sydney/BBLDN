// Renders `.env.example` from the env registry (06 §2.5; HANDOFF §5.4): names grouped as 06 §2.5, one-line purpose,
// the D / P / Pr marks — and NO values (07 §7). Pure: the CLI writes or diffs the result.
import type { ENV_SCHEMA } from "../../../src/modules/config/lib/env-schema.ts";

type Schema = typeof ENV_SCHEMA;
type Entry = Schema["entries"][keyof Schema["entries"]];

const HEADER = [
  "# .env.example — GENERATED from src/modules/config/lib/env-schema.ts by `npm run env:example`; do not edit by hand",
  "# (`npm run env:check` fails CI on drift — 06 §2.5, HANDOFF §5.4). Names only, never a value (07 §7): copy to",
  "# .env.local and fill in. Marks per environment — dev · preview · prod: ● required · ○ optional · — absent.",
  '# Booleans are the literal "true" (absent = the flag\'s code default — 01 §3.4). Provider bindings are closed enums.',
  "",
].join("\n");

function describe(entry: Entry): string {
  const marks = `${entry.dev} dev · ${entry.preview} preview · ${entry.prod} prod`;
  const kind =
    entry.kind === "enum"
      ? ` [${entry.values.join(" | ")}]`
      : entry.kind === "string"
        ? ""
        : ` [${entry.kind}]`;
  const scope = entry.scope === "public" ? " (public)" : "";
  return `# ${marks}${scope}${kind} — ${entry.purpose}`;
}

export function renderEnvExample(schema: Schema): string {
  const entries = Object.entries(schema.entries) as ReadonlyArray<
    readonly [string, Entry]
  >;
  const sections = schema.groups.map((group) => {
    const lines = entries
      .filter(([, entry]) => entry.group === group)
      .flatMap(([name, entry]) => [describe(entry), `${name}=`]);
    return [`# ── ${group} ──`, ...lines].join("\n");
  });
  return `${HEADER}\n${sections.join("\n\n")}\n`;
}
