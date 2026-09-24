// database-catalogue.mjs — the names the real schema has, read from the generated types. One export.
//
// `src/modules/shared-types/database.types.ts` is produced by `supabase gen types` from the applied migration
// set and diffed against a freshly generated copy by CI's `types-drift`, so it is the only description of the
// schema in this repo that cannot quietly disagree with the database. Every schema-name check reads it rather
// than a hand-written list: a list copied from the schema drifts, a file generated from it cannot.
//
// Parsed by indentation rather than by the TypeScript API on purpose — the generated file has one fixed shape,
// and a parser that cannot load the compiler is a parser that always runs. A shape change makes this return
// nothing, which the caller treats as fatal (a catalogue with no tables must never pass a check).
import { readFileSync } from "node:fs";

/**
 * @param {string} typesFile absolute path to `database.types.ts`
 * @param {string} [schema]  the schema block to read (default `public`)
 * @returns {{ tables: Record<string, string[]>, views: Record<string, string[]>, functions: string[], enums: Record<string, string[]> }}
 */
export function databaseCatalogue(typesFile, schema = "public") {
  const lines = readFileSync(typesFile, "utf8").split("\n");
  const start = lines.indexOf(`  ${schema}: {`);
  const out = { tables: {}, views: {}, functions: [], enums: {} };
  if (start === -1) return out;

  let section = null;
  let name = null;
  let inRow = false;

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === "  }") break; // end of the schema block

    const sectionOpen = /^ {4}(\w+): \{$/.exec(line);
    if (sectionOpen) {
      section = sectionOpen[1];
      name = null;
      inRow = false;
      continue;
    }

    const member = /^ {6}([A-Za-z0-9_]+): /.exec(line);
    if (member) {
      name = member[1];
      inRow = false;
      if (section === "Tables") out.tables[name] = [];
      else if (section === "Views") out.views[name] = [];
      else if (section === "Functions") {
        if (!out.functions.includes(name)) out.functions.push(name);
      } else if (section === "Enums") {
        out.enums[name] = [
          ...line.slice(line.indexOf(":") + 1).matchAll(/"([^"]+)"/g),
        ].map((m) => m[1]);
      }
      continue;
    }

    if (section === "Enums" && name !== null) {
      const value = /^\s+\| "([^"]+)"/.exec(line);
      if (value) out.enums[name].push(value[1]);
      continue;
    }

    if ((section === "Tables" || section === "Views") && name !== null) {
      if (/^ {8}Row: \{$/.test(line)) {
        inRow = true;
        continue;
      }
      if (inRow && /^ {8}\}$/.test(line)) {
        inRow = false;
        continue;
      }
      if (inRow) {
        const column = /^ {10}([A-Za-z0-9_]+)\??:/.exec(line);
        if (column) {
          const bag = section === "Tables" ? out.tables : out.views;
          if (!bag[name].includes(column[1])) bag[name].push(column[1]);
        }
      }
    }
  }
  return out;
}
