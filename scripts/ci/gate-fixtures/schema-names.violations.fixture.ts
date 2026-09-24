// Fixture: driven by check-schema-names.mjs on every run, so the gate can never pass vacuously.
// Each case is a reconstruction of a reference the real tree carries; the counts in the gate are the assertion.
// Not scanned as source — the gate reads only `src/` — and deliberately untyped, because the defect class this
// gate exists for is exactly the query that no `Database` generic checks.
type Chain = {
  select: (columns: string) => Chain;
  in: (column: string, values: unknown[]) => Chain;
  eq: (column: string, value: unknown) => Chain;
  update: (row: Record<string, unknown>) => Chain;
};
type Client = {
  from: (name: string) => Chain;
  rpc: (name: string, args: unknown) => Promise<unknown>;
  storage: {
    from: (bucket: string) => { upload: (path: string) => Promise<void> };
  };
};
declare const db: Client;

export async function cases(): Promise<void> {
  // 1 — the London defect: `nanny_positions` exists, `status` does not (the stage model replaced it).
  db.from("nanny_positions").select("id,stage").in("status", ["OPEN"]);
  // 2 — a column named in a write.
  db.from("parents").update({ verification_level: "full" });
  // 3 — a table the London schema never had (unported Sydney feature).
  db.from("bapp_milestones").select("id");
  // 4 — an RPC the schema does not define.
  await db.rpc("sydney_only_function", {});
  // 5 — a bucket outside BucketKey / UPLOADS.buckets.
  await db.storage.from("hire-pdfs").upload("x");
}
