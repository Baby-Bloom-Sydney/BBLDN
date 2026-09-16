-- 0015_storage.sql — the ordered migration set (02-data-model.md §6 row 0015)
--
-- Creates: the **three** buckets of 02 §8 — `profile-pictures`, `verification-documents`,
-- `development-images` — and their object policies (07 §5.3 rule 2).
--
-- Rollback twin: supabase/rollbacks/0015_storage.rollback.sql
--
-- @adr ADR-061 — these three and no more. `parent-verifications` is **not created** (ADR-071:
--   parent verification is removed, not deferred) and `share-screenshots` is not created (N-3).
--   01 §6.1 still lists four buckets; that is 02 §9 item 14's amendment, not a licence to make one.
-- 07 §5.3 rule 1 / fix R8 + D-5 — **all three are private.** `profile-pictures` is not public:
--   uuid names are not an access control (URLs leak through referrers, caches and screenshots), and
--   an isolated nanny's picture must never be fetchable by guessing. Reads are signed URLs minted
--   server-side by the owning module's read model - 1 h for app surfaces, 24 h with
--   `Cache-Control: private` for browse and profile pages - never by a component.
-- 07 §5.3 rule 5 — `file_size_limit` = UPLOADS.maxBytes (10 MB) and `allowed_mime_types` =
--   UPLOADS.buckets[...].mimeTypes from config/uploads.ts. The values below are that config's
--   values; when it changes, this is a new migration, because a bucket is provisioned by migration
--   and never by hand (02 §8; 11.26).
--
-- Not in this file, deliberately: the **anti-malware scan** (07 §5.3 rule 3, fix S-5). It is a step
-- inside the one upload server action - MIME sniff, size cap, scan, object metadata, registry row -
-- and a storage policy cannot express it. The database's half of that contract is here: no user
-- SELECT policy on any bucket, so an object that has not yet been through the action and had its
-- signed URL minted is unreachable regardless.

-- ---------------------------------------------------------------------------
-- 1. The three buckets (02 §8)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-pictures', 'profile-pictures', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('verification-documents', 'verification-documents', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  ('development-images', 'development-images', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Object policies by prefix (07 §5.3 rule 2).
--    storage.objects is already RLS-enabled by Supabase; these are the London
--    policies on top. `storage.foldername(name)` splits the path, so
--    `[1]` is the first segment and `[2]` the second.
-- ---------------------------------------------------------------------------

-- profile-pictures/<role>/<user_id>/<uuid>.<ext>
-- INSERT / UPDATE / DELETE where the first two segments match the caller's role
-- and auth.uid(); **no SELECT policy for users** - signed URLs bypass RLS by
-- design, which is the whole mechanism (07 §5.3 rule 1).
drop policy if exists profile_pictures_owner_insert on storage.objects;
create policy profile_pictures_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-pictures'
    -- 07 §5.3 rule 2: the first two segments match the caller's **role** and auth.uid(). The first
    -- draft accepted either word, so a parent could write under `nanny/<own uid>/`
    -- (security-reviewer LOW).
    and (storage.foldername(name))[1]
        = case when (select public.is_nanny()) then 'nanny' else 'parent' end
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists profile_pictures_owner_update on storage.objects;
create policy profile_pictures_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-pictures'
    and (storage.foldername(name))[1] in ('parent', 'nanny')
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-pictures'
    and (storage.foldername(name))[1]
        = case when (select public.is_nanny()) then 'nanny' else 'parent' end
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists profile_pictures_owner_delete on storage.objects;
create policy profile_pictures_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-pictures'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- verification-documents/<user_id>/<section>/<uuid>.<ext>
-- INSERT only, own prefix, one of the four section names. **No SELECT, UPDATE or
-- DELETE for any user** (07 §5.3 rule 2): a nanny cannot read her own evidence
-- back, because the copy she uploaded is not hers to re-download once it is
-- criminal-offence or biometric data at rest (07 §2.5, §2.6). Signed 1 h URLs are
-- minted server-side by `verification` for the provider runner and by
-- `admin-verification` for the queue.
drop policy if exists verification_documents_owner_insert on storage.objects;
create policy verification_documents_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in
        ('identity-document', 'identity-selfie', 'dbs-certificate', 'rtw-document')
  );

-- development-images/children/<child_id>/<uuid>.<ext>  — INSERT / DELETE by a
-- user with child access; development-images/chat/<user_id>/…  — INSERT / DELETE
-- own. SELECT via signed URLs only, so again no SELECT policy.
drop policy if exists development_images_child_insert on storage.objects;
-- The uuid shape is checked before the cast: `::uuid` on a malformed segment raises 22P02, which
-- surfaces as a database error rather than a policy denial (both reviewers). AND does not guarantee
-- left-to-right evaluation in Postgres, but a regex test that fails makes the cast unreachable in
-- every plan that short-circuits, and the regex is cheap enough to be worth having regardless.
create policy development_images_child_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'development-images'
    and (storage.foldername(name))[1] = 'children'
    and (storage.foldername(name))[2] ~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and (select public.user_has_child_access(((storage.foldername(name))[2])::uuid))
  );

drop policy if exists development_images_child_delete on storage.objects;
create policy development_images_child_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'development-images'
    and (storage.foldername(name))[1] = 'children'
    and (storage.foldername(name))[2] ~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and (select public.user_has_child_access(((storage.foldername(name))[2])::uuid))
  );

drop policy if exists development_images_chat_insert on storage.objects;
create policy development_images_chat_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'development-images'
    and (storage.foldername(name))[1] = 'chat'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists development_images_chat_delete on storage.objects;
create policy development_images_chat_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'development-images'
    and (storage.foldername(name))[1] = 'chat'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- Admin: all operations on all three (07 §5.3 rule 2 last line).
drop policy if exists storage_admin_all on storage.objects;
create policy storage_admin_all on storage.objects
  for all to authenticated
  using (
    bucket_id in ('profile-pictures', 'verification-documents', 'development-images')
    and (select public.is_admin())
  )
  with check (
    bucket_id in ('profile-pictures', 'verification-documents', 'development-images')
    and (select public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- 3. Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_b text;
  v_n int;
  v_bad_names text;
begin
  foreach v_b in array array['profile-pictures', 'verification-documents', 'development-images'] loop
    if not exists (select 1 from storage.buckets where id = v_b) then
      raise exception '0015: bucket % missing (02 §8)', v_b;
    end if;
    -- R8 / D-5: every one of the three is private
    if exists (select 1 from storage.buckets where id = v_b and public) then
      raise exception '0015: bucket % must be private (07 §5.3 rule 1)', v_b;
    end if;
    if not exists (
      select 1 from storage.buckets
      where id = v_b and file_size_limit = 10485760 and allowed_mime_types is not null
    ) then
      raise exception '0015: bucket % must carry the config/uploads.ts cap and MIME list (07 §5.3 rule 5)', v_b;
    end if;
  end loop;

  -- ADR-071 / N-3: the two buckets that are not created
  if exists (select 1 from storage.buckets where id in ('parent-verifications', 'share-screenshots')) then
    raise exception '0015: parent-verifications / share-screenshots must not exist (ADR-071, N-3)';
  end if;

  -- 07 §5.3 rule 2: no read policy for a user on any London bucket. Asserted over **every** policy
  -- on storage.objects, not over the eight this file happens to name - the first draft's filter
  -- asked whether any of eight `*_insert` / `*_update` / `*_delete` policies had cmd = 'SELECT',
  -- which is an empty set by construction and could never fire (security-reviewer M4). The one
  -- allowed reader is the admin's `for all` policy.
  select coalesce(string_agg(policyname, ', '), '') into v_bad_names
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname <> 'storage_admin_all'
    and cmd in ('SELECT', 'ALL')
    and roles::text[] && array['anon', 'authenticated'];
  if v_bad_names <> '' then
    raise exception '0015: a user read policy exists on storage.objects - reads are signed URLs only (07 §5.3 rule 1): %', v_bad_names;
  end if;

  -- the nanny may write her evidence and never read it back (07 §5.3 rule 2)
  select coalesce(string_agg(policyname || ':' || cmd, ', '), '') into v_bad_names
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'verification_documents%';
  if v_bad_names <> 'verification_documents_owner_insert:INSERT' then
    raise exception '0015: verification-documents must carry exactly one user policy, INSERT; found [%]', v_bad_names;
  end if;

  -- the whole bucket model rests on storage.objects having RLS at all, and nothing asserted it
  if not exists (
    select 1 from pg_class where oid = 'storage.objects'::regclass and relrowsecurity
  ) then
    raise exception '0015: storage.objects does not have row level security enabled';
  end if;
end
$$;
