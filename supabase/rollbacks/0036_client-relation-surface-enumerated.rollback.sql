-- 0036_client-relation-surface-enumerated.rollback.sql — the twin of
-- supabase/migrations/0036_client-relation-surface-enumerated.sql (06 §4.2; **ADR-165 arm (1)**).
--
-- ★ **This twin restores nothing.** `0036` is a security clause from its first statement to its last, and
-- undoing it means two things ADR-165 forbids outright: handing a stranger with the public anon key a write
-- privilege on 57 of the 61 tables in `public`, and re-arming the `pg_default_acl` row that mints that same
-- privilege on **every table any future migration creates**. The second is the worse half, because it is the
-- one nobody would notice: it writes no `grant` line anywhere, and its effect arrives later.
--
-- ⚠️ **The statements are described rather than written out** (`3j`'s security LOW, `0035`'s precedent, and
-- it applies here at least as hard). An operator mid-incident wants something to paste, and this file's
-- subject is exactly what they must not paste. Anyone who genuinely needs the inverse can read the
-- enumerated block in `0036` and invert it, which is a deliberate enough act to be the point.
--
-- ⚠️ **WHAT IT DELIBERATELY DOES NOT UNDO — all of it, named.**
--
--   · **The blanket revoke stays.** The set `0036` grants back is a **superset** of what any policy in the
--     schema permits, so no reverted application code is left without a privilege it could have used. That
--     is not an argument: the 41-file integration suite was run against the applied set, from empty, and
--     passes at 746.
--   · **The nine views stay read-only, and this is the clause to read twice before touching.** A view carries
--     no RLS, all nine are owned by `postgres` (which holds **BYPASSRLS**), and all nine are
--     `security_invoker = off` — so a write routed through an auto-updatable one reaches its base table with
--     row security **not applied**. Driven, in one transaction, at one role, against one table: a direct
--     `insert into public.events` as `authenticated` was refused by RLS, and the identical insert through a
--     view of exactly that shape returned `INSERT 0 1`. Restoring a view write grant does not restore a
--     defence-in-depth layer; it restores the one place in this schema where RLS does not apply.
--   · **The default privilege stays revoked.** `0000` §4 left SELECT/INSERT/UPDATE/DELETE in `postgres`'s
--     default ACL for `public` on the stated ground that RLS gates them. That is what made the blanket grant
--     invisible — there is no `grant` statement in any migration to find. Re-arming it is `0016:288` with
--     nobody to blame.
--   · **Nothing here re-opens `PUBLIC`.** A grant to `PUBLIC` reaches both client roles without naming
--     either, which is how a re-grant would undo this file by a side door. `0036` asserts it is zero and so
--     does this twin.
--
-- ⚠️ **AND THEREFORE: there is no rollback path from this file. The recovery is roll-forward.** If a client
-- path is found that genuinely needs a privilege `0036` took, the fix is a new migration granting **that one
-- command on that one relation**, together with the **policy** that makes it reachable — because without a
-- policy the grant cannot carry a write anyway — plus the matching entry in `int.client-grants` with its
-- reason and its from-where. Not a blanket re-grant at 3 a.m.
--
-- And one thing to know before writing that migration, because `0036`'s header measured it: unlike a
-- function — which is born `EXECUTE TO PUBLIC` however hard `0000:329` revokes the default — a **table** is
-- now born with no client privilege at all. That is the one place in this schema where the default is on our
-- side, and it is on our side only because `0036` §3 put it there.
--
-- ADR-165 (2)'s `RAISE EXCEPTION` is not used, for ADR-177's reason: that refusal belongs to a twin that
-- genuinely cannot proceed, and this one can — it completes, having correctly done nothing.
--
-- One transaction, so that "did nothing" is a fact about the database and not about how far it got.

begin;

-- The privilege half is intentionally empty: every statement it could contain is one ADR-165 forbids.
-- The object half is empty because `0036` created no object.

commit;

-- ---------------------------------------------------------------------------
-- Verify — the twin's own claim, asserted rather than described (ADR-165 (3)).
-- ---------------------------------------------------------------------------
do $$
declare
  v_anon_write  int;
  v_auth_write  int;
  v_anon_read   int;
  v_view_write  int;
  v_no_policy   int;
  v_public      int;
  v_defacl      int;
  v_total       int;
begin
  select count(*) into v_total from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v');

  -- 1. ★ Neither client role got the write surface back. Asserted as a **comparison** rather than as the
  --    literals 0 and 12 — `3j`'s security LOW, whose cost `0034` proved by turning `0032`'s twin red on a
  --    lawful 34th relation. The exact membership is `int.client-grants`'s, held against the enumeration on
  --    every run; what this twin owes is the claim that the *shape* did not come back.
  select count(*) into v_anon_write from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v')
     and (has_table_privilege('anon', c.oid, 'INSERT') or has_any_column_privilege('anon', c.oid, 'INSERT')
       or has_table_privilege('anon', c.oid, 'UPDATE') or has_any_column_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE'));
  if v_anon_write <> 0 then
    raise exception '0036 twin: anon holds a write privilege on % relation(s) again — there is no anon write policy in this schema', v_anon_write;
  end if;

  select count(*) into v_auth_write from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v')
     and (has_table_privilege('authenticated', c.oid, 'INSERT') or has_any_column_privilege('authenticated', c.oid, 'INSERT')
       or has_table_privilege('authenticated', c.oid, 'UPDATE') or has_any_column_privilege('authenticated', c.oid, 'UPDATE')
       or has_table_privilege('authenticated', c.oid, 'DELETE'));
  if v_auth_write > v_total / 2 then
    raise exception '0036 twin: authenticated may write % of % relations in public — the surface is back', v_auth_write, v_total;
  end if;

  select count(*) into v_anon_read from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v')
     and (has_table_privilege('anon', c.oid, 'SELECT') or has_any_column_privilege('anon', c.oid, 'SELECT'));
  if v_anon_read > v_total / 2 then
    raise exception '0036 twin: anon may read % of % relations in public — the surface is back', v_anon_read, v_total;
  end if;

  -- 2. ★ No view carries a client write. Named separately from the count above because it is the half that
  --    was load-bearing: a view is the one place in this schema where RLS is not the backstop.
  select count(*) into v_view_write from pg_class c join pg_namespace n on n.oid = c.relnamespace,
       lateral (select unnest(array['anon','authenticated']) as g) r
   where n.nspname = 'public' and c.relkind = 'v'
     and (has_table_privilege(r.g, c.oid, 'INSERT') or has_table_privilege(r.g, c.oid, 'UPDATE')
       or has_table_privilege(r.g, c.oid, 'DELETE'));
  if v_view_write <> 0 then
    raise exception '0036 twin: % client write grant(s) are back on a view — a view has no RLS and ours are owned by a BYPASSRLS role', v_view_write;
  end if;

  -- 3. ★ The rule, not the list: no client write grant exists without a policy permitting it. This is the
  --    assertion that would have been red on `main`, on 54 relations, and it is stated as a rule so it
  --    survives a later migration adding a policy.
  select count(*) into v_no_policy from pg_class c join pg_namespace n on n.oid = c.relnamespace,
       lateral (select unnest(array['anon','authenticated']) as g) r
   where n.nspname = 'public' and c.relkind in ('r','p')
     and (has_table_privilege(r.g, c.oid, 'INSERT') or has_any_column_privilege(r.g, c.oid, 'INSERT')
       or has_table_privilege(r.g, c.oid, 'UPDATE') or has_any_column_privilege(r.g, c.oid, 'UPDATE')
       or has_table_privilege(r.g, c.oid, 'DELETE'))
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = c.relname
                        and p.cmd in ('INSERT','UPDATE','DELETE','ALL')
                        and p.roles::text[] && array[r.g, 'public']);
  if v_no_policy <> 0 then
    raise exception '0036 twin: % client write grant(s) have no write policy — the grant is the only thing standing again', v_no_policy;
  end if;

  -- 4. ★ The side door: a grant TO PUBLIC reaches both client roles without naming either.
  select count(*) into v_public from pg_class c join pg_namespace n on n.oid = c.relnamespace,
       lateral aclexplode(c.relacl) a
   where n.nspname = 'public' and c.relkind in ('r','p','v') and a.grantee = 0;
  if v_public <> 0 then
    raise exception '0036 twin: % grant(s) TO PUBLIC are back in public', v_public;
  end if;

  -- 5. ★ The durable half: the default privilege is still revoked, so the next table is still born clean.
  select count(*) into v_defacl from pg_default_acl d, lateral aclexplode(d.defaclacl) x
   where d.defaclobjtype = 'r' and d.defaclrole = 'postgres'::regrole
     and d.defaclnamespace = 'public'::regnamespace
     and x.grantee::regrole::text in ('anon','authenticated');
  if v_defacl <> 0 then
    raise exception '0036 twin: postgres carries % default-privilege entr(ies) again — every future table is blanket-granted', v_defacl;
  end if;

  -- 6. ★ …and the app still works, which is the failure mode a twin about revocations must not have. The
  --    three anon reads and the view reads `authenticated` depends on are still there.
  if not has_table_privilege('anon', 'public.areas', 'SELECT')
     or not has_table_privilege('anon', 'public.legal_documents', 'SELECT')
     or not has_table_privilege('anon', 'public.nanny_public', 'SELECT')
     or not has_table_privilege('authenticated', 'public.verification_status', 'SELECT')
     or not has_table_privilege('authenticated', 'public.family_access', 'SELECT')
     or not has_table_privilege('authenticated', 'public.user_profiles', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.children', 'INSERT') then
    raise exception '0036 twin: a privilege the client genuinely uses has gone';
  end if;
end;
$$;
