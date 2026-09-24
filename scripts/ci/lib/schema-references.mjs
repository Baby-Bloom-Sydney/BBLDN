// schema-references.mjs — every schema identifier a source file names in a query. One export.
//
// **What this is for.** PostgREST takes its table and column names as strings, so a name the schema does not
// have is not a type error at the seam — it is a 42703 / 42P01 at runtime, on the page, for every user. London's
// `/parent` was exactly that: `getPosition` filtered `.in("status", …)` on `nanny_positions`, whose London
// schema replaced `status` with `stage`, and the error card rendered before the hub ever mounted.
//
// The repo's own module tree does not have this problem, and the reason is worth stating because it is what the
// gate is calibrated against: `src/modules/` and `src/boot/` query through `Query<AppDatabase>`
// (`shared-types/platform.ts`), whose `from` / `select` / `eq` / `insert` / `update` / `rpc` are generic over the
// **generated** types, so a wrong name there is a compile error. The 42703 class lives entirely in the legacy
// tree, whose Supabase clients carry no `Database` generic and therefore check nothing.
//
// Parsed with the TypeScript API rather than by regex because the thing being read is a **chain**: the column
// names in `.eq(…)` belong to whichever `.from(…)` started the statement, and no regex knows where a statement
// ends. `ts` is a devDependency the `typecheck` gate already requires, so this costs nothing new.
//
// Storage is not the database: `supabase.storage.from("bucket")` is reported as a `bucket` reference, never
// checked against the table list — conflating them would report three real buckets as three missing tables.
import ts from "typescript";

/** PostgREST filter builders whose first string argument is a column name. */
const COLUMN_FILTERS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "contains",
  "containedBy",
  "overlaps",
  "order",
  "not",
  "rangeGt",
  "rangeGte",
  "rangeLt",
  "rangeLte",
  "rangeAdjacent",
  "likeAllOf",
  "likeAnyOf",
  "ilikeAllOf",
  "ilikeAnyOf",
]);

/** Builders whose argument is a row object (or an array of them) whose keys are column names. */
const ROW_WRITERS = new Set(["insert", "update", "upsert"]);

/**
 * `alias:column::cast->>json` → `column`. `*` and the bare aggregate `count` are not column names.
 * `count` exactly, never a `count`-prefixed name: `count_of_x` is an ordinary column, and dropping it would
 * narrow the gate silently — the one direction a green check cannot be told apart from a clean tree.
 */
function columnOf(token) {
  let name = token.trim();
  const alias = name.indexOf(":");
  if (alias > -1 && name[alias + 1] !== ":") name = name.slice(alias + 1);
  name = name.split("::")[0].split("->")[0].trim();
  if (name === "" || name === "*" || name === "count") return null;
  return name;
}

/** The top-level columns of a PostgREST `select` string; embedded `relation(…)` bodies are skipped. */
function selectColumns(select) {
  const columns = [];
  let depth = 0;
  let token = "";
  for (const character of select) {
    if (character === "(") {
      depth += 1;
      if (depth === 1) token = "";
      continue;
    }
    if (character === ")") {
      depth -= 1;
      if (depth === 0) token = "";
      continue;
    }
    if (depth > 0) continue;
    if (character === ",") {
      const name = columnOf(token);
      if (name !== null) columns.push(name);
      token = "";
      continue;
    }
    token += character;
  }
  const last = columnOf(token);
  if (last !== null) columns.push(last);
  return columns;
}

const literalText = (node) =>
  node !== undefined &&
  (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;

/** `supabase.storage.from(…)` / `client.storage.from(…)` — a bucket, not a table. */
function isStorageReceiver(expression) {
  let node = expression;
  while (ts.isCallExpression(node)) node = node.expression;
  return ts.isPropertyAccessExpression(node) && node.name.text === "storage";
}

/**
 * @param {string} fileName  used only for the script kind and for diagnostics
 * @param {string} source
 * @returns {Array<{ kind: "table"|"column"|"rpc"|"bucket", table: string|null, name: string, line: number, via: string }>}
 */
export function schemaReferences(fileName, source) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found = [];
  const lineOf = (node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
    1;

  const readChain = (fromCall, table) => {
    let current = fromCall;
    while (
      current.parent !== undefined &&
      ts.isPropertyAccessExpression(current.parent) &&
      current.parent.expression === current &&
      current.parent.parent !== undefined &&
      ts.isCallExpression(current.parent.parent) &&
      current.parent.parent.expression === current.parent
    ) {
      const method = current.parent.name.text;
      const call = current.parent.parent;
      const first = call.arguments[0];
      const text = literalText(first);

      if (method === "select" && text !== null) {
        for (const column of selectColumns(text))
          found.push({
            kind: "column",
            table,
            name: column,
            line: lineOf(first),
            via: "select",
          });
      } else if (COLUMN_FILTERS.has(method) && text !== null) {
        const name = columnOf(text);
        // `not("a", "is", null)` and embedded `rel.col` filters are not plain columns of this table.
        if (name !== null && !name.includes("(") && !name.includes("."))
          found.push({
            kind: "column",
            table,
            name,
            line: lineOf(first),
            via: method,
          });
      } else if (ROW_WRITERS.has(method) && first !== undefined) {
        const rows = ts.isArrayLiteralExpression(first)
          ? first.elements
          : [first];
        for (const row of rows) {
          if (!ts.isObjectLiteralExpression(row)) continue;
          for (const property of row.properties) {
            if (
              !ts.isPropertyAssignment(property) &&
              !ts.isShorthandPropertyAssignment(property)
            )
              continue;
            const key = property.name;
            if (
              key === undefined ||
              (!ts.isIdentifier(key) && !ts.isStringLiteral(key))
            )
              continue;
            found.push({
              kind: "column",
              table,
              name: key.text,
              line: lineOf(property),
              via: method,
            });
          }
        }
      }
      current = current.parent.parent;
    }
  };

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const method = node.expression.name.text;
      const text = literalText(node.arguments[0]);
      if (method === "from" && text !== null) {
        if (isStorageReceiver(node.expression.expression)) {
          found.push({
            kind: "bucket",
            table: null,
            name: text,
            line: lineOf(node.arguments[0]),
            via: "storage.from",
          });
        } else {
          found.push({
            kind: "table",
            table: text,
            name: text,
            line: lineOf(node.arguments[0]),
            via: "from",
          });
          readChain(node, text);
        }
      } else if (method === "rpc" && text !== null) {
        found.push({
          kind: "rpc",
          table: null,
          name: text,
          line: lineOf(node.arguments[0]),
          via: "rpc",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
