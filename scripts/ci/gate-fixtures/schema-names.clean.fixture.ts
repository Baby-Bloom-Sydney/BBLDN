// Fixture: the correct forms of every case in schema-names.violations.fixture.ts. The gate asserts this file
// reports NOTHING — a check that also fires on the right shape is a tax, and a tax is how a check gets removed.
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
  // The same reads, spelled the way the London schema spells them.
  db.from("nanny_positions").select("id,stage,parent_id").in("stage", ["OPEN"]);
  db.from("parents").update({ signup_source: "x" });
  db.from("nanny_public").select("nanny_id"); // a view, not a table — both are readable names
  await db.rpc("upsert_position", {});
  await db.storage.from("verification-documents").upload("x");
  // Aliases, casts, embeds and json paths must resolve to the real column, not to the decoration.
  db.from("nanny_positions")
    .select("title,opened:created_at,position_schedule(id)")
    .eq("id", 1);
}
