-- 0013_katie.sql — the ordered migration set (02-data-model.md §6 row 0013)
--
-- Creates: `bloombot`, `chat_messages`, `chat_summaries`, `agent_memory`, `chat_draft_locks`,
-- `proactive_schedules`, `katie_prompt`, `katie_prompt_version` (+ its bump trigger),
-- `katie_prompt_edits`, `katie_proposals`, `chat_cost_daily` and `increment_chat_cost()`.
-- 02 §4.6 "App — Katie".
--
-- Forced by: chat_messages.child_id -> children (0012).
-- Rollback twin: supabase/rollbacks/0013_katie.rollback.sql
--
-- The code names stay (02 §4.6): `bloombot`, `chat_*`, `katie_*`. "Katie" is the user-facing name
-- and lives in copy, not in the schema.
-- **No `katie_prompt` seed** (HANDOFF §6.2 row 0013): the live rows are exported from Sydney
-- production in Phase 5 (02 §9 item 26), and a prompt is content, not structure.
-- 02 §5 row 1 — no `bsr` module rows and no `bsr_job` tile kind.
-- C-3 — `proactive_schedules.timezone` is written from config/locale.ts; Sydney's
--   `Australia/Sydney` DDL default is not carried (02 §5 row 13).

create table if not exists public.bloombot (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null unique references auth.users (id) on delete cascade,
  role       public.user_role not null,
  settings   jsonb       not null default '{}'::jsonb,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bloombot is
  '02 §4.6: one bot per user, created lazily on the first chat or proactive send. `role` mirrors user_roles; `settings` carries waking hours and the timezone, both from config.';

drop trigger if exists bloombot_set_updated_at on public.bloombot;
create trigger bloombot_set_updated_at
  before update on public.bloombot
  for each row execute function public.set_updated_at();

create table if not exists public.chat_messages (
  id                    uuid        primary key default gen_random_uuid(),
  bloombot_id           uuid        not null references public.bloombot (id) on delete cascade,
  child_id              uuid        references public.children (id) on delete set null,
  role                  public.chat_role not null,
  content               text,
  metadata              jsonb,
  tile                  jsonb,
  trigger_source        public.chat_trigger_source not null default 'user',
  proactive_trigger_id  text,
  proactive_schedule_id uuid,
  is_read               boolean     not null default true,
  surface_route         text,
  surface_feature       text,
  created_at            timestamptz not null default now()
);

comment on column public.chat_messages.is_read is
  '02 §4.6: only a proactive row is ever unread, which is why the default is true - a reply to something the user just typed has already been seen.';
comment on column public.chat_messages.tile is
  '02 §4.6 / 02 §5 row 1: no `bsr_job` tile kind. A child-scoped tile requires user_has_child_access at write, enforced by the module.';

create index if not exists chat_messages_bot_idx on public.chat_messages (bloombot_id, created_at desc);
create index if not exists chat_messages_unread_idx on public.chat_messages (bloombot_id)
  where not is_read;
create index if not exists chat_messages_child_idx on public.chat_messages (child_id)
  where child_id is not null;

create table if not exists public.chat_summaries (
  id            uuid        primary key default gen_random_uuid(),
  bloombot_id   uuid        not null references public.bloombot (id) on delete cascade,
  child_id      uuid        references public.children (id) on delete cascade,
  period        public.summary_period not null default 'daily',
  date_start    date        not null,
  date_end      date        not null,
  summary       text        not null,
  key_events    jsonb,
  message_count integer     not null default 0,
  created_at    timestamptz not null default now(),

  constraint chat_summaries_range_check check (date_end >= date_start),
  constraint chat_summaries_count_check check (message_count >= 0)
);

-- 02 §4.6: unique (bot, child, period, date_start). `child_id` is nullable and a
-- NULL never equals a NULL, so the uniqueness is split rather than lost.
create unique index if not exists chat_summaries_child_period_idx
  on public.chat_summaries (bloombot_id, child_id, period, date_start)
  where child_id is not null;
create unique index if not exists chat_summaries_account_period_idx
  on public.chat_summaries (bloombot_id, period, date_start)
  where child_id is null;

create table if not exists public.agent_memory (
  id                uuid        primary key default gen_random_uuid(),
  bloombot_id       uuid        not null references public.bloombot (id) on delete cascade,
  child_id          uuid        references public.children (id) on delete cascade,
  scope             public.memory_scope not null,
  priority          public.memory_priority not null default 'medium',
  relevant_until    timestamptz,
  tags              text[]      not null default '{}',
  content           text        not null,
  source_message_id uuid        references public.chat_messages (id) on delete set null,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- 02 §4.6: account ⇒ child_id NULL; child / shared ⇒ set
  constraint agent_memory_scope_child_check
    check ((scope = 'account') = (child_id is null))
);

create index if not exists agent_memory_bot_idx on public.agent_memory (bloombot_id)
  where is_active;
create index if not exists agent_memory_child_idx on public.agent_memory (child_id)
  where child_id is not null and is_active;
create index if not exists agent_memory_source_idx on public.agent_memory (source_message_id)
  where source_message_id is not null;

drop trigger if exists agent_memory_set_updated_at on public.agent_memory;
create trigger agent_memory_set_updated_at
  before update on public.agent_memory
  for each row execute function public.set_updated_at();

create table if not exists public.chat_draft_locks (
  draft_id    text        primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  tool_name   text        not null,
  acquired_at timestamptz not null default now()
);

comment on table public.chat_draft_locks is
  '02 §4.6: idempotency for draft-tile Accept - a retry gets 409, not a second write. Pruned after 7 days by compact-daily.';

create index if not exists chat_draft_locks_acquired_idx on public.chat_draft_locks (acquired_at);

create table if not exists public.proactive_schedules (
  id              uuid        primary key default gen_random_uuid(),
  bloombot_id     uuid        not null references public.bloombot (id) on delete cascade,
  child_id        uuid        references public.children (id) on delete cascade,
  trigger_id      text,
  module_id       text,
  description     text,
  created_by      public.schedule_created_by not null default 'module',
  cron_expr       text,
  one_time_at     timestamptz,
  timezone        text        not null,
  next_run_at     timestamptz,
  last_run_at     timestamptz,
  last_status     text,
  last_error      text,
  mode            public.schedule_mode not null default 'template',
  template        text,
  prompt_fragment text,
  payload         jsonb,
  active          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 02 §4.6: exactly one of cron_expr / one_time_at
  constraint proactive_schedules_one_trigger_check
    check ((cron_expr is null) <> (one_time_at is null))
);

comment on column public.proactive_schedules.timezone is
  'C-3: written from config/locale.ts. There is no DDL default - a default would be the literal 02 §5 row 13 removed.';

create index if not exists proactive_schedules_due_idx on public.proactive_schedules (next_run_at)
  where active;
create index if not exists proactive_schedules_bot_idx on public.proactive_schedules (bloombot_id);

-- C-2 (FKs on every relationship): chat_messages.proactive_schedule_id pointed at this table by
-- name only (database-reviewer M-19). The constraint is added here rather than on the column,
-- because proactive_schedules is created after chat_messages in this file.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chat_messages_proactive_schedule_id_fkey') then
    alter table public.chat_messages
      add constraint chat_messages_proactive_schedule_id_fkey
      foreign key (proactive_schedule_id) references public.proactive_schedules (id) on delete set null;
  end if;
end
$$;

create index if not exists chat_messages_proactive_schedule_idx
  on public.chat_messages (proactive_schedule_id) where proactive_schedule_id is not null;

drop trigger if exists proactive_schedules_set_updated_at on public.proactive_schedules;
create trigger proactive_schedules_set_updated_at
  before update on public.proactive_schedules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Prompt-as-data (02 §4.6). No seed here: Phase 5 exports the live rows from
-- Sydney production (02 §9 item 26; HANDOFF §6.2 row 0013).
-- ---------------------------------------------------------------------------

create table if not exists public.katie_prompt (
  section     text        not null,
  version     integer     not null,
  content     text        not null,
  is_active   boolean     not null default false,
  protected   boolean     not null default false,
  edited_by   uuid        references auth.users (id) on delete set null,
  edit_reason text,
  created_at  timestamptz not null default now(),

  constraint katie_prompt_pkey primary key (section, version),
  constraint katie_prompt_version_check check (version >= 1)
);

create unique index if not exists katie_prompt_one_active_per_section_idx
  on public.katie_prompt (section)
  where is_active;

create table if not exists public.katie_prompt_version (
  id           uuid        primary key default gen_random_uuid(),
  version_hash text        not null,
  updated_at   timestamptz not null default now(),
  singleton    boolean     not null default true,

  constraint katie_prompt_version_singleton_check check (singleton)
);

create unique index if not exists katie_prompt_version_singleton_idx
  on public.katie_prompt_version (singleton);

comment on table public.katie_prompt_version is
  '02 §4.6: the single version hash the cache manager reads. Singleton by construction - a partial unique on a column that can only hold true.';

create or replace function public.bump_katie_prompt_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  select md5(string_agg(p.section || ':' || p.version || ':' || p.content, '|' order by p.section))
    into v_hash
  from public.katie_prompt p where p.is_active;

  insert into public.katie_prompt_version (version_hash, singleton)
  values (coalesce(v_hash, ''), true)
  on conflict (singleton) do update set version_hash = excluded.version_hash, updated_at = now();

  return null;
end;
$$;

comment on function public.bump_katie_prompt_version() is
  '02 §7: prompt-cache invalidation. One hash over every active section, recomputed whenever a section changes - so a stale prompt cannot survive an edit.';

drop trigger if exists katie_prompt_bump_version on public.katie_prompt;
create trigger katie_prompt_bump_version
  after insert or update or delete on public.katie_prompt
  for each statement execute function public.bump_katie_prompt_version();

create table if not exists public.katie_prompt_edits (
  id                    uuid        primary key default gen_random_uuid(),
  bloombot_id           uuid        references public.bloombot (id) on delete set null,
  section               text        not null,
  before_version        integer,
  before_content        text,
  after_version         integer,
  after_content         text,
  diff                  text,
  reason                text,
  status                public.prompt_edit_status not null default 'applied',
  rolled_back_by_edit_id uuid       references public.katie_prompt_edits (id) on delete set null,
  applied_by            uuid        references auth.users (id) on delete set null,
  applied_at            timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

comment on table public.katie_prompt_edits is
  '02 §4.6: insert-only. A rollback is a new row pointing back, never an edit of the row it undoes.';

create index if not exists katie_prompt_edits_section_idx
  on public.katie_prompt_edits (section, applied_at desc);
create index if not exists katie_prompt_edits_rollback_idx
  on public.katie_prompt_edits (rolled_back_by_edit_id)
  where rolled_back_by_edit_id is not null;

drop trigger if exists katie_prompt_edits_append_only on public.katie_prompt_edits;
create trigger katie_prompt_edits_append_only
  before update or delete on public.katie_prompt_edits
  for each row execute function public.prevent_row_modification();

-- the same statement-level backstop the other append-only tables carry (security-reviewer H3)
drop trigger if exists katie_prompt_edits_no_truncate on public.katie_prompt_edits;
create trigger katie_prompt_edits_no_truncate
  before truncate on public.katie_prompt_edits
  for each statement execute function public.prevent_row_modification();

create table if not exists public.katie_proposals (
  id             uuid        primary key default gen_random_uuid(),
  bloombot_id    uuid        references public.bloombot (id) on delete set null,
  proposed_by    uuid        references auth.users (id) on delete set null,
  kind           public.proposal_kind not null,
  target         text,
  summary        text        not null,
  details        text,
  suggested_diff text,
  status         public.proposal_status not null default 'open',
  reviewer_notes text,
  reviewed_by    uuid        references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists katie_proposals_status_idx on public.katie_proposals (status, created_at desc);

create table if not exists public.chat_cost_daily (
  bloombot_id        uuid        not null references public.bloombot (id) on delete cascade,
  date               date        not null,
  input_tokens       bigint      not null default 0,
  output_tokens      bigint      not null default 0,
  cached_tokens      bigint      not null default 0,
  estimated_cost_usd numeric(10, 6) not null default 0,
  turn_count         integer     not null default 0,
  proactive_count    integer     not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint chat_cost_daily_pkey primary key (bloombot_id, date),
  constraint chat_cost_daily_non_negative_check check (
    input_tokens >= 0 and output_tokens >= 0 and cached_tokens >= 0
    and estimated_cost_usd >= 0 and turn_count >= 0 and proactive_count >= 0
  )
);

comment on table public.chat_cost_daily is
  '02 §4.6: per-bot per-day accrual behind the daily cap (config.katie.dailyLimitUsd). Costs are USD because the model providers price in USD; every customer-facing amount in this schema is GBP pence (C-5).';

drop trigger if exists chat_cost_daily_set_updated_at on public.chat_cost_daily;
create trigger chat_cost_daily_set_updated_at
  before update on public.chat_cost_daily
  for each row execute function public.set_updated_at();

-- 02 §7: the atomic daily accrual. Written only through this function, so two
-- concurrent turns cannot both read-then-write the same day's row.
create or replace function public.increment_chat_cost(
  p_bloombot_id uuid,
  p_date date,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cached_tokens bigint,
  p_cost_usd numeric,
  p_is_proactive boolean
)
returns public.chat_cost_daily
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.chat_cost_daily;
begin
  insert into public.chat_cost_daily as c (
    bloombot_id, date, input_tokens, output_tokens, cached_tokens,
    estimated_cost_usd, turn_count, proactive_count
  ) values (
    p_bloombot_id, p_date, coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0),
    coalesce(p_cached_tokens, 0), coalesce(p_cost_usd, 0), 1,
    case when p_is_proactive then 1 else 0 end
  )
  on conflict (bloombot_id, date) do update set
    input_tokens       = c.input_tokens + coalesce(p_input_tokens, 0),
    output_tokens      = c.output_tokens + coalesce(p_output_tokens, 0),
    cached_tokens      = c.cached_tokens + coalesce(p_cached_tokens, 0),
    estimated_cost_usd = c.estimated_cost_usd + coalesce(p_cost_usd, 0),
    turn_count         = c.turn_count + 1,
    proactive_count    = c.proactive_count + case when p_is_proactive then 1 else 0 end
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.increment_chat_cost(uuid, date, bigint, bigint, bigint, numeric, boolean) from public;
grant execute on function public.increment_chat_cost(uuid, date, bigint, bigint, bigint, numeric, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- RLS (02 C-10; 07 §5.2 row "Katie tables"). The owner reads her own bot's
-- rows; **every write is service role** (the chat route, the dispatcher and the
-- cost tracker are all server-side); the prompt, proposal and cost tables are
-- admin-read only.
-- ---------------------------------------------------------------------------

alter table public.bloombot enable row level security;
alter table public.bloombot force row level security;

drop policy if exists bloombot_owner_select on public.bloombot;
create policy bloombot_owner_select on public.bloombot
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists bloombot_admin_select on public.bloombot;
create policy bloombot_admin_select on public.bloombot
  for select to authenticated using ((select public.is_admin()));

alter table public.chat_messages enable row level security;
alter table public.chat_messages force row level security;

drop policy if exists chat_messages_owner_select on public.chat_messages;
create policy chat_messages_owner_select on public.chat_messages
  for select to authenticated
  using (exists (select 1 from public.bloombot b
                 where b.id = chat_messages.bloombot_id and b.user_id = (select auth.uid())));

drop policy if exists chat_messages_admin_select on public.chat_messages;
create policy chat_messages_admin_select on public.chat_messages
  for select to authenticated using ((select public.is_admin()));

alter table public.chat_summaries enable row level security;
alter table public.chat_summaries force row level security;

drop policy if exists chat_summaries_owner_select on public.chat_summaries;
create policy chat_summaries_owner_select on public.chat_summaries
  for select to authenticated
  using (exists (select 1 from public.bloombot b
                 where b.id = chat_summaries.bloombot_id and b.user_id = (select auth.uid())));

alter table public.agent_memory enable row level security;
alter table public.agent_memory force row level security;

drop policy if exists agent_memory_owner_select on public.agent_memory;
create policy agent_memory_owner_select on public.agent_memory
  for select to authenticated
  using (exists (select 1 from public.bloombot b
                 where b.id = agent_memory.bloombot_id and b.user_id = (select auth.uid()))
         -- 02 §4.6: a `shared` memory line follows the child, not the bot
         or (scope = 'shared' and (select public.user_has_child_access(child_id))));

alter table public.proactive_schedules enable row level security;
alter table public.proactive_schedules force row level security;

drop policy if exists proactive_schedules_owner_select on public.proactive_schedules;
create policy proactive_schedules_owner_select on public.proactive_schedules
  for select to authenticated
  using (exists (select 1 from public.bloombot b
                 where b.id = proactive_schedules.bloombot_id and b.user_id = (select auth.uid())));

-- Service role only, no client policy at all (02 §4.6).
alter table public.chat_draft_locks enable row level security;
alter table public.chat_draft_locks force row level security;

-- Admin only (02 §4.6; 07 §5.2).
alter table public.katie_prompt enable row level security;
alter table public.katie_prompt force row level security;
alter table public.katie_prompt_version enable row level security;
alter table public.katie_prompt_version force row level security;
alter table public.katie_prompt_edits enable row level security;
alter table public.katie_prompt_edits force row level security;
alter table public.katie_proposals enable row level security;
alter table public.katie_proposals force row level security;
alter table public.chat_cost_daily enable row level security;
alter table public.chat_cost_daily force row level security;

drop policy if exists katie_prompt_admin_select on public.katie_prompt;
create policy katie_prompt_admin_select on public.katie_prompt
  for select to authenticated using ((select public.is_admin()));

drop policy if exists katie_prompt_version_admin_select on public.katie_prompt_version;
create policy katie_prompt_version_admin_select on public.katie_prompt_version
  for select to authenticated using ((select public.is_admin()));

drop policy if exists katie_prompt_edits_admin_select on public.katie_prompt_edits;
create policy katie_prompt_edits_admin_select on public.katie_prompt_edits
  for select to authenticated using ((select public.is_admin()));

drop policy if exists katie_proposals_admin_select on public.katie_proposals;
create policy katie_proposals_admin_select on public.katie_proposals
  for select to authenticated using ((select public.is_admin()));

drop policy if exists katie_proposals_admin_update on public.katie_proposals;
create policy katie_proposals_admin_update on public.katie_proposals
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists chat_cost_daily_admin_select on public.chat_cost_daily;
create policy chat_cost_daily_admin_select on public.chat_cost_daily
  for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_t text;
  v_n int;
begin
  foreach v_t in array array['bloombot', 'chat_messages', 'chat_summaries', 'agent_memory',
                             'chat_draft_locks', 'proactive_schedules', 'katie_prompt',
                             'katie_prompt_version', 'katie_prompt_edits', 'katie_proposals',
                             'chat_cost_daily'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0013: public.% missing', v_t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception '0013: public.% must ENABLE and FORCE row level security (02 C-10)', v_t;
    end if;
    -- 07 §5.2: every Katie write is service role; katie_proposals' admin review is the exception
    select count(*) into v_n
    from pg_policies where schemaname = 'public' and tablename = v_t and cmd <> 'SELECT';
    if v_n <> 0 and v_t <> 'katie_proposals' then
      raise exception '0013: public.% must be SELECT-only for client roles (07 §5.2)', v_t;
    end if;
  end loop;

  if to_regprocedure('public.increment_chat_cost(uuid, date, bigint, bigint, bigint, numeric, boolean)') is null then
    raise exception '0013: increment_chat_cost() missing (02 §7)';
  end if;
  if to_regprocedure('public.bump_katie_prompt_version()') is null then
    raise exception '0013: bump_katie_prompt_version() missing (02 §7)';
  end if;
  -- HANDOFF §6.2 row 0013: no prompt seed here
  select count(*) into v_n from public.katie_prompt;
  if v_n <> 0 then
    raise exception '0013: katie_prompt is seeded in Phase 5 from Sydney production, not here (02 §9 item 26)';
  end if;
  if to_regclass('public.chat_cost_daily') is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_cost_daily' and column_name = 'amount_aud_cents'
  ) then
    raise exception '0013: an AUD money column exists (02 §5 row 11)';
  end if;
end
$$;
