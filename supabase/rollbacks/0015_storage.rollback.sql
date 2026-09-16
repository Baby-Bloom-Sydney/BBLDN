-- 0015_storage.rollback.sql — the twin of supabase/migrations/0015_storage.sql (06 §4.2).
--
-- Drops the nine object policies — which is the half that matters, because with them gone no client
-- role can write or delete an object in any of the three buckets — and then attempts to remove the
-- bucket rows.
--
-- **Measured platform behaviour (2026-09-16, bb-ldn-preview):** Supabase carries a
-- `protect_buckets_delete` trigger on `storage.buckets` that refuses a direct DELETE with
-- "Direct deletion from storage tables is not allowed. Use the Storage API instead." The trigger is
-- owned by `supabase_storage_admin`, not by the migration role, so a migration cannot disable it.
-- A bucket is therefore removed through the Storage API (`supabase storage rm`, or the dashboard),
-- never by SQL — and this file does not pretend otherwise: it tries, reports what happened, and
-- does not raise on a refusal the platform owns. Forward re-apply is unaffected: 0015's insert is
-- `on conflict do update`, so re-running it over surviving buckets restores exactly the intended
-- configuration.

begin;

drop policy if exists storage_admin_all on storage.objects;
drop policy if exists development_images_chat_delete on storage.objects;
drop policy if exists development_images_chat_insert on storage.objects;
drop policy if exists development_images_child_delete on storage.objects;
drop policy if exists development_images_child_insert on storage.objects;
drop policy if exists verification_documents_owner_insert on storage.objects;
drop policy if exists profile_pictures_owner_delete on storage.objects;
drop policy if exists profile_pictures_owner_update on storage.objects;
drop policy if exists profile_pictures_owner_insert on storage.objects;

do $$
declare
  v_left int;
begin
  begin
    delete from storage.buckets
    where id in ('profile-pictures', 'verification-documents', 'development-images');
  exception
    when others then
      raise notice '0015 rollback: the platform refused the bucket delete (%) - remove them with the Storage API', sqlerrm;
  end;

  select count(*) into v_left from storage.buckets
  where id in ('profile-pictures', 'verification-documents', 'development-images');
  if v_left > 0 then
    raise notice '0015 rollback: % bucket(s) remain; policies are gone, so no client role can reach an object', v_left;
  end if;

  -- the part this file can guarantee, and therefore does assert
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (policyname like 'profile_pictures%' or policyname like 'verification_documents%'
           or policyname like 'development_images%' or policyname = 'storage_admin_all')
  ) then
    raise exception '0015 rollback: a London storage policy is still present';
  end if;
end
$$;

commit;
