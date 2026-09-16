-- 0013_katie.rollback.sql — the twin of supabase/migrations/0013_katie.sql (06 §4.2).
--
-- Drops the eleven Katie tables and their two functions. Nothing later references them, so this
-- rollback stands alone and may be run without unwinding 0014-0016 first.

begin;

drop policy if exists chat_cost_daily_admin_select on public.chat_cost_daily;
drop policy if exists katie_proposals_admin_update on public.katie_proposals;
drop policy if exists katie_proposals_admin_select on public.katie_proposals;
drop policy if exists katie_prompt_edits_admin_select on public.katie_prompt_edits;
drop policy if exists katie_prompt_version_admin_select on public.katie_prompt_version;
drop policy if exists katie_prompt_admin_select on public.katie_prompt;
drop policy if exists proactive_schedules_owner_select on public.proactive_schedules;
drop policy if exists agent_memory_owner_select on public.agent_memory;
drop policy if exists chat_summaries_owner_select on public.chat_summaries;
drop policy if exists chat_messages_admin_select on public.chat_messages;
drop policy if exists chat_messages_owner_select on public.chat_messages;
drop policy if exists bloombot_admin_select on public.bloombot;
drop policy if exists bloombot_owner_select on public.bloombot;

drop trigger if exists chat_cost_daily_set_updated_at on public.chat_cost_daily;
drop trigger if exists katie_prompt_edits_no_truncate on public.katie_prompt_edits;
drop trigger if exists katie_prompt_edits_append_only on public.katie_prompt_edits;
drop trigger if exists katie_prompt_bump_version on public.katie_prompt;
drop trigger if exists proactive_schedules_set_updated_at on public.proactive_schedules;
drop trigger if exists agent_memory_set_updated_at on public.agent_memory;
drop trigger if exists bloombot_set_updated_at on public.bloombot;

-- chat_messages.proactive_schedule_id points at proactive_schedules (0013's own FK, added after
-- both tables exist). Drop it first or the table drop is refused.
alter table if exists public.chat_messages
  drop constraint if exists chat_messages_proactive_schedule_id_fkey;

drop function if exists public.increment_chat_cost(uuid, date, bigint, bigint, bigint, numeric, boolean);
drop function if exists public.bump_katie_prompt_version();

drop table if exists public.chat_cost_daily;
drop table if exists public.katie_proposals;
drop table if exists public.katie_prompt_edits;
drop table if exists public.katie_prompt_version;
drop table if exists public.katie_prompt;
drop table if exists public.proactive_schedules;
drop table if exists public.chat_draft_locks;
drop table if exists public.agent_memory;
drop table if exists public.chat_summaries;
drop table if exists public.chat_messages;
drop table if exists public.bloombot;

do $$
declare
  v_t text;
begin
  foreach v_t in array array['chat_cost_daily', 'katie_proposals', 'katie_prompt_edits',
                             'katie_prompt_version', 'katie_prompt', 'proactive_schedules',
                             'chat_draft_locks', 'agent_memory', 'chat_summaries',
                             'chat_messages', 'bloombot'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0013 rollback: public.% still present', v_t;
    end if;
  end loop;
end
$$;

commit;
