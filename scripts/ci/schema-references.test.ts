// The extractor behind `check:schema-names`, driven case by case.
//
// The gate itself drives its two fixtures on every run, with exact counts, so it cannot pass vacuously. This
// suite is the finer half: the PostgREST spellings that decide whether a column reference is read at all —
// an alias, a cast, a json path, an embedded relation, a storage bucket. Each of these, read wrongly, makes the
// gate quietly narrower rather than red, which is the failure mode a green gate hides best.
import { describe, expect, it } from "vitest";
// @ts-expect-error — a .mjs CI helper with no declaration file; the gate is JavaScript on purpose.
import { schemaReferences } from "./lib/schema-references.mjs";

type Reference = {
  kind: "table" | "column" | "rpc" | "bucket";
  table: string | null;
  name: string;
  line: number;
  via: string;
};

const refs = (source: string): Reference[] =>
  schemaReferences("probe.ts", source) as Reference[];
const columnsOf = (source: string, table: string): string[] =>
  refs(source)
    .filter((r) => r.kind === "column" && r.table === table)
    .map((r) => r.name);

describe("schemaReferences", () => {
  it("attributes a filter column to the table the chain started from", () => {
    // Arrange / Act
    const found = refs(
      `db.from("nanny_positions").select("id").in("status", ["OPEN"]);`,
    );
    // Assert
    expect(found.filter((r) => r.kind === "table").map((r) => r.name)).toEqual([
      "nanny_positions",
    ]);
    expect(
      columnsOf(
        `db.from("nanny_positions").select("id").in("status", ["OPEN"]);`,
        "nanny_positions",
      ),
    ).toEqual(["id", "status"]);
  });

  it("reads the real column through an alias, a cast and a json path", () => {
    expect(
      columnsOf(
        `db.from("t").select("opened:created_at,total::int,details->>a");`,
        "t",
      ),
    ).toEqual(["created_at", "total", "details"]);
  });

  it("drops the bare `count` aggregate but keeps a count-prefixed column", () => {
    // `count` is PostgREST's aggregate, not a column. `count_of_x` is an ordinary column, and dropping it
    // would narrow the gate without turning it red — the failure a green check hides best.
    expect(columnsOf(`db.from("t").select("count,count_of_x");`, "t")).toEqual([
      "count_of_x",
    ]);
  });

  it("does not read an embedded relation's body as columns of the outer table", () => {
    expect(
      columnsOf(`db.from("t").select("title,other(id,name)");`, "t"),
    ).toEqual(["title"]);
  });

  it("reads the keys of an insert, an update and each row of a batch", () => {
    expect(columnsOf(`db.from("t").insert({ a: 1, b: 2 });`, "t")).toEqual([
      "a",
      "b",
    ]);
    expect(columnsOf(`db.from("t").update({ c: 1 });`, "t")).toEqual(["c"]);
    expect(
      columnsOf(`db.from("t").insert([{ d: 1 }, { e: 2 }]);`, "t"),
    ).toEqual(["d", "e"]);
  });

  it("reports a storage bucket as a bucket, never as a table", () => {
    const found = refs(`sb.storage.from("hire-pdfs").upload(p, f);`);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "bucket", name: "hire-pdfs" });
  });

  it("reports an rpc by name", () => {
    expect(refs(`db.rpc("upsert_position", {});`)).toMatchObject([
      { kind: "rpc", name: "upsert_position" },
    ]);
  });

  it("reads nothing from a dynamic table name, rather than guessing", () => {
    // A `.from(variable)` cannot be checked against the catalogue; reporting nothing is the honest answer,
    // and it is why the gate's claim is about literal names only.
    expect(refs(`db.from(table).select("whatever");`)).toEqual([]);
  });

  it("keeps two chains in one file apart", () => {
    const source = `db.from("a").eq("x", 1); db.from("b").eq("y", 2);`;
    expect(columnsOf(source, "a")).toEqual(["x"]);
    expect(columnsOf(source, "b")).toEqual(["y"]);
  });
});
