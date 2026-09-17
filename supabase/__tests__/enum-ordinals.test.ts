// The enum-ordinal suite (02 C-1; 03 §2.6 I-7).
//
// `src/modules/shared-types/enums/*` freezes each enum as a tuple whose **index is the ordinal**,
// and the application reads ">=" comparisons off those indices. The database holds the same values
// with their own sort order. If the two ever disagree — a value inserted in the middle of a
// migration, a tuple reordered in a refactor — every "level >= L3" and "stage >= INTRO_SCHEDULED"
// answer silently changes meaning. Nothing else in the repo compares the two, so this suite is the
// only thing standing between that and production.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ENUMS } from "@/modules/shared-types";
import { connect } from "./db-client";

type EnumName = keyof typeof ENUMS;

let db: Client;
let dbEnums: Record<string, string[]>;

beforeAll(async () => {
  db = await connect();
  const { rows } = await db.query<{ typname: string; labels: string[] }>(
    `select t.typname::text as typname,
            array_agg(e.enumlabel::text order by e.enumsortorder) as labels
     from pg_type t
     join pg_namespace n on n.oid = t.typnamespace
     join pg_enum e on e.enumtypid = t.oid
     where n.nspname = 'public' and t.typtype = 'e'
     group by t.typname`,
  );
  dbEnums = Object.fromEntries(rows.map((r) => [r.typname, r.labels]));
});

afterAll(async () => {
  await db?.end();
});

const names = Object.keys(ENUMS) as EnumName[];

describe("enum ordinals — the database and shared-types are one register", () => {
  it("shared-types holds the 80 enums of 02 §3 (79 + `consent_purpose`, 0017)", () => {
    expect(names).toHaveLength(80);
  });

  it("the database holds exactly the same enum names — no more, no fewer", () => {
    expect(Object.keys(dbEnums).sort()).toEqual([...names].sort());
  });

  it.each(names)(
    "%s has identical values in identical order",
    (name: EnumName) => {
      // Deliberately toEqual on the array, not a set comparison: the ORDER is the
      // contract (C-1), and a set comparison would pass on a reordered enum.
      expect(dbEnums[name]).toEqual([...ENUMS[name]]);
    },
  );

  it("guarantee_promise still carries the reserved, unused nanny-bonus (ADR-099, C-1)", () => {
    expect(dbEnums.guarantee_promise).toContain("nanny-bonus");
  });

  it("user_role has no super_admin (R-12; 07 §5.4 row 3)", () => {
    expect(dbEnums.user_role).toEqual(["parent", "nanny", "admin"]);
  });

  it("call_state is ADR-073's three values, not the pending-24h draft", () => {
    expect(dbEnums.call_state).toEqual([
      "awaiting-slot",
      "slot-chosen",
      "done",
    ]);
  });

  it("verification_level sorts L0 -> L4, which is what every level gate relies on", () => {
    expect(dbEnums.verification_level).toEqual([
      "L0_SIGNED_UP",
      "L1_REGISTERED",
      "L2_ID_VERIFIED",
      "L3_PROVISIONALLY_VERIFIED",
      "L4_FULLY_VERIFIED",
    ]);
  });
});
