-- 0012_app.rollback.sql — the twin of supabase/migrations/0012_app.sql (06 §4.2).
--
-- Drops the eight app tables, the child_client_events view, the nine child-linking RPCs and the
-- two foreign keys 0012 added to earlier tables (subscribe_invites.child_id from 0010 and
-- children.profile_image_id). chat_messages.child_id (0013) references `children`, so this refuses
-- while 0013 is applied — roll back in reverse order.

begin;

alter table if exists public.subscribe_invites drop constraint if exists subscribe_invites_child_id_fkey;
drop index if exists public.subscribe_invites_child_idx;
alter table if exists public.children drop constraint if exists children_profile_image_id_fkey;

drop policy if exists development_images_access_select on public.development_images;
drop policy if exists progress_history_access_select on public.progress_history;
drop policy if exists progress_scores_access_select on public.progress_scores;
drop policy if exists feed_posts_parent_hide on public.feed_posts;
drop policy if exists feed_posts_author_update on public.feed_posts;
drop policy if exists feed_posts_access_insert on public.feed_posts;
drop policy if exists feed_posts_access_select on public.feed_posts;
drop policy if exists milestones_authenticated_select on public.milestones;
drop policy if exists child_invites_creator_select on public.child_invites;
drop policy if exists child_client_party_select on public.child_client;
drop policy if exists children_parent_delete on public.children;
drop policy if exists children_access_update on public.children;
drop policy if exists children_nanny_insert on public.children;
drop policy if exists children_parent_insert on public.children;
drop policy if exists children_access_select on public.children;

drop view if exists public.child_client_events;

drop trigger if exists children_guard_protected_columns on public.children;
drop trigger if exists feed_posts_guard_columns on public.feed_posts;
drop trigger if exists feed_posts_set_updated_at on public.feed_posts;
drop trigger if exists progress_scores_set_updated_at on public.progress_scores;
drop trigger if exists child_invites_set_updated_at on public.child_invites;
drop trigger if exists children_set_updated_at on public.children;

drop function if exists public.update_soft_lock(uuid, boolean);
drop function if exists public.nanny_leave_child(uuid, text);
drop function if exists public.remove_nanny_from_child(uuid, text);
drop function if exists public.end_child_link(uuid, public.actor_role, text);
drop function if exists public.end_placement_if_no_shared_children(uuid);
drop function if exists public.connect_child_invite(text, uuid);
drop function if exists public.get_pending_invites_for_recipient();
drop function if exists public.get_invite_preview(text);
drop function if exists public.ensure_placement(uuid, uuid, uuid);
drop function if exists public.guard_feed_post_soft_delete_only();
drop function if exists public.guard_children_protected_columns();

drop table if exists public.progress_history;
drop table if exists public.progress_scores;
drop table if exists public.feed_posts;
drop table if exists public.milestones;
drop table if exists public.development_images;
drop table if exists public.child_invites;
drop table if exists public.child_client;
drop table if exists public.children;

-- user_has_child_access() goes last: the app policies above and the 0013 Katie
-- policies read it.
drop function if exists public.user_has_child_access(uuid);

do $$
declare
  v_t text;
begin
  foreach v_t in array array['progress_history', 'progress_scores', 'feed_posts', 'milestones',
                             'development_images', 'child_invites', 'child_client', 'children'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0012 rollback: public.% still present', v_t;
    end if;
  end loop;
  if to_regprocedure('public.user_has_child_access(uuid)') is not null then
    raise exception '0012 rollback: user_has_child_access() still present';
  end if;
end
$$;

commit;
