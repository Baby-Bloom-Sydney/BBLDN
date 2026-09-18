// The three rows every seeded human needs, in the order the real signup writes them (02 §4.1): the account,
// the role, the profile. Contact and location live on `user_profiles` and nowhere else (R-7), and
// `is_test_user` is set here rather than by a later sweep, so a row cannot exist for a moment without it
// (ADR-024 — it is what keeps seeded people out of every metric).
import type { Client } from "pg";
import type { PersonRole, SeedArea, SyntheticPerson } from "./types.ts";

/** Supabase's own instance id for a single-project stack; `auth.users` is NOT NULL on it. */
const INSTANCE_ID = "00000000-0000-0000-0000-000000000000";

export async function writePerson(
  db: Client,
  person: SyntheticPerson,
  role: PersonRole,
  area: SeedArea | null,
): Promise<string> {
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                             created_at, updated_at)
     values ($1, $2, 'authenticated', 'authenticated', $3, 'seeded-no-password', now(),
             '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [INSTANCE_ID, person.id, person.email],
  );
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, $2)`,
    [person.id, role],
  );
  await db.query(
    `insert into public.user_profiles (user_id, first_name, last_name, email, mobile,
                                       district, area, is_test_user)
     values ($1, $2, $3, $4, $5, $6, $7, true)`,
    [
      person.id,
      person.firstName,
      person.lastName,
      person.email,
      person.mobile,
      area?.district ?? null,
      area?.area ?? null,
    ],
  );
  return person.id;
}
