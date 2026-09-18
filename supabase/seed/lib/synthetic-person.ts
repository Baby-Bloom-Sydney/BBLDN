// One invented person. **Nothing here is, or resembles, a record of a real human being** — that is the whole
// job of this file, and `int.seed` asserts each half of it against the seeded database:
//
//   - the **address** is on `config.testUserDomain` (`example.test`, reserved by RFC 6761 and excluded from
//     every metric by `is_test_user`, ADR-024) — never a deliverable mailbox;
//   - the **mobile** is inside Ofcom's reserved drama range, 07700 900000–900999, the block set aside so that
//     a number printed in fiction cannot ring anybody. Built from `LOCALE.phonePrefix`, not written out;
//   - the **name** is drawn from a fixed pool of ordinary given names and surnames. A name alone identifies
//     nobody; what keeps these rows from being mistaken for people is the domain, the number and the flag.
//
// The id is derived, not random, so the same index is the same person on every reset — a demo that renumbers
// itself on every seed is a demo nobody can write anything down about. The `5eed` prefix is also the marker
// `realDataRefusals` reads to refuse a second run.
import { LOCALE } from "../../../src/modules/config/locale.ts";
import { TEST_USER_DOMAIN } from "../../../src/modules/config/testUserDomain.ts";
import type { PersonRole, SyntheticPerson } from "./types.ts";

const GIVEN_NAMES = [
  "Amara",
  "Beatrix",
  "Cerys",
  "Delphine",
  "Esme",
  "Farida",
  "Greta",
  "Hafsa",
  "Imogen",
  "Juno",
  "Kaisa",
  "Leonie",
  "Maeve",
  "Nadia",
  "Orla",
  "Priya",
  "Quilla",
  "Rosalind",
  "Sabine",
  "Tamsin",
  "Ulla",
  "Verity",
  "Wren",
  "Xanthe",
  "Yara",
  "Zola",
] as const;

const SURNAMES = [
  "Ashdown",
  "Brackley",
  "Cheltenham",
  "Dunwoody",
  "Ellerby",
  "Fenwick",
  "Garrow",
  "Halloway",
  "Ivorson",
  "Jestico",
  "Kenward",
  "Lindhurst",
  "Marchbank",
  "Netherby",
  "Ockenden",
  "Prideaux",
] as const;

/** Per-role id space and mobile block, so two roles at the same index can never collide. */
const ROLE_SPACE: Readonly<
  Record<PersonRole, { readonly hex: string; readonly block: number }>
> = Object.freeze({
  parent: { hex: "01", block: 0 },
  nanny: { hex: "02", block: 100 },
  admin: { hex: "03", block: 900 },
});

/** The `5eed` marker every seeded account carries — read by `realDataRefusals`, never by the app. */
export const SEED_ID_PREFIX = "5eed";

export function syntheticPerson(
  role: PersonRole,
  index: number,
): SyntheticPerson {
  const space = ROLE_SPACE[role];
  const firstName = GIVEN_NAMES[index % GIVEN_NAMES.length];
  const lastName = SURNAMES[(index * 7 + space.block) % SURNAMES.length];
  const line = (space.block + index) % 1000;
  return {
    id: `${SEED_ID_PREFIX}${space.hex}00-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    firstName,
    lastName,
    // unique per person: the role and the index are both in it, so no two seeded people share an address
    email: `${firstName.toLowerCase()}.${role}${index}@${TEST_USER_DOMAIN}`,
    mobile: `${LOCALE.phonePrefix}7700900${line.toString().padStart(3, "0")}`,
  };
}
