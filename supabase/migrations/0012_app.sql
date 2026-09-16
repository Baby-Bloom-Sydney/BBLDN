-- 0012_app.sql — the ordered migration set (02-data-model.md §6 row 0012)
--
-- Creates: `children`, `child_client`, `child_invites`, `development_images`, `milestones`
-- (+ the 210-row library), `feed_posts`, `progress_scores`, `progress_history` (02 §4.6 "App");
-- `user_has_child_access()` and the child-linking RPCs of 02 §7; the view `child_client_events`;
-- and the two deferred foreign keys — `subscribe_invites.child_id` (0010) and
-- `children.profile_image_id`.
--
-- Rollback twin: supabase/rollbacks/0012_app.rollback.sql
--
-- ADR candidate (02 §9 item 13): `children` is the record, `child_client` is the **link**, and the
--   link history is kept - unlinking ends a row, it never deletes one.
-- 02 §4.6 `child_client`, stage-model O-3: the **placement shell rule**. An active link for a
--   family that was never matched gets a shell position (source = invite, ACTIVE) and an
--   `invite_shell` placement through `ensure_placement`, so I-3 and I-4 hold for a family that
--   arrived sideways. 0007's deferred I-3 trigger is scoped accordingly.
-- memory project_invite_token_format / _stability: the token is `XXXX-XXXX`, Crockford-like with
--   the hyphen stored, and it is **stable** - there is no rotation, no expiry column and no
--   `regenerated` revoke reason (02 §3 `invite_revoked_reason`, §5 row 13). Revoke is the only
--   invalidation path.
-- @adr ADR-061 — `development_images` is the registry for the private `development-images` bucket
--   (0015); every object has a row, signed URLs are minted by `app`, nothing is Cloudinary.
-- 02 §5 row 1 — no babysitting anything: no `bsr_*`, no `bsr_job` tile, no AGR-07 / AGR-09.
-- 02 §5 row 13 — `child_client` has no `created_auto` / `trial` / `trial_ended` state and no
--   `parent_lead_email`; `child_invites` has no `bonus_program` and no `family_trial_started_at`.
--
-- The EYFS label is `config.app.frameworkLabel`, not a literal here (L4): the 210 milestone rows
-- carry ids, domains, brackets and descriptions, and the framework's *name* is rendered by the app.

-- ---------------------------------------------------------------------------
-- 1. `children` (02 §4.6 "App" row 1). profile_image_id's FK is added at the
--    end of this file, once development_images exists.
-- ---------------------------------------------------------------------------

create table if not exists public.children (
  id                    uuid        primary key default gen_random_uuid(),
  parent_user_id        uuid        references auth.users (id) on delete set null,
  first_name            text        not null,
  date_of_birth         date        not null,
  gender                text,
  profile_image_id      uuid,
  status                public.child_status not null default 'setup',
  onboarded             boolean     not null default false,
  orphaned_at           timestamptz,
  feed_locked_for_nanny boolean     not null default false,
  feed_locked_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint children_dob_not_future_check check (date_of_birth <= current_date),
  constraint children_feed_lock_pair_check check (feed_locked_for_nanny = (feed_locked_at is not null))
);

comment on table public.children is
  '02 §4.6: the child record a family and a nanny share. parent_user_id is null while a nanny-created child is unclaimed. The age cap is config.app.maxChildAgeMonths and lives in the module (02 §9 item 5), not in DDL.';

create index if not exists children_parent_idx on public.children (parent_user_id)
  where parent_user_id is not null;
create index if not exists children_orphaned_idx on public.children (orphaned_at)
  where orphaned_at is not null;

drop trigger if exists children_set_updated_at on public.children;
create trigger children_set_updated_at
  before update on public.children
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. `child_client` (02 §4.6 "App" row 2) — the family <-> nanny <-> child link.
-- ---------------------------------------------------------------------------

create table if not exists public.child_client (
  id             uuid        primary key default gen_random_uuid(),
  child_id       uuid        not null references public.children (id) on delete cascade,
  nanny_user_id  uuid        not null references auth.users (id) on delete cascade,
  parent_user_id uuid        references auth.users (id) on delete set null,
  placement_id   uuid        references public.nanny_placements (id) on delete set null,
  source         public.link_source not null,
  state          public.link_state not null default 'active',
  ended_at       timestamptz,
  ended_by       public.actor_role,
  end_reason     text,
  created_at     timestamptz not null default now(),

  constraint child_client_ended_pair_check
    check ((state = 'ended') = (ended_at is not null))
);

comment on table public.child_client is
  '02 §4.6: one row per engagement. Unlinking ENDS the row and never deletes it - the history is the point (02 §9 item 13). Written only by the definer RPCs below.';

create unique index if not exists child_client_one_active_per_child_idx
  on public.child_client (child_id)
  where state = 'active';

create index if not exists child_client_nanny_idx on public.child_client (nanny_user_id, state);
create index if not exists child_client_parent_idx on public.child_client (parent_user_id, state);
create index if not exists child_client_placement_idx on public.child_client (placement_id)
  where placement_id is not null;

-- ---------------------------------------------------------------------------
-- 3. `child_invites` (02 §4.6 "App" row 3) — the invite-token state machine.
-- ---------------------------------------------------------------------------

create table if not exists public.child_invites (
  id                          uuid        primary key default gen_random_uuid(),
  child_id                    uuid        not null references public.children (id) on delete cascade,
  token                       text        not null unique,
  direction                   public.invite_direction not null,
  status                      public.invite_status not null default 'pending',
  created_by_user_id          uuid        references auth.users (id) on delete set null,
  created_by_email_at_creation extensions.citext,
  recipient_user_id           uuid        references auth.users (id) on delete set null,
  connected_at                timestamptz,
  connected_by_user_id        uuid        references auth.users (id) on delete set null,
  revoked_at                  timestamptz,
  revoked_reason              public.invite_revoked_reason,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint child_invites_token_shape_check
    check (token ~ '^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$'),
  constraint child_invites_connected_pair_check
    check ((status = 'connected') = (connected_at is not null)),
  constraint child_invites_revoked_pair_check
    check ((status = 'revoked') = (revoked_at is not null))
);

comment on table public.child_invites is
  '02 §4.6: ends only by claim, revoke or child deletion. **No rotation and no expiry column** (memory project_invite_token_stability); the share URL is built from config.urls, never from a literal.';

create unique index if not exists child_invites_one_pending_per_direction_idx
  on public.child_invites (child_id, direction)
  where status = 'pending';

create index if not exists child_invites_recipient_idx on public.child_invites (recipient_user_id)
  where recipient_user_id is not null;

drop trigger if exists child_invites_set_updated_at on public.child_invites;
create trigger child_invites_set_updated_at
  before update on public.child_invites
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. `development_images` (02 §4.6 "development records" row 5) — the registry
--    behind the private bucket (0015).
-- ---------------------------------------------------------------------------

create table if not exists public.development_images (
  id                 uuid        primary key default gen_random_uuid(),
  child_id           uuid        references public.children (id) on delete cascade,
  uploaded_by_user_id uuid       not null references auth.users (id) on delete cascade,
  storage_path       text        not null unique,
  mime               text        not null,
  bytes              integer     not null,
  consent_record_id  uuid        references public.consent_records (id) on delete set null,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),

  constraint development_images_bytes_check check (bytes > 0),
  -- I-V7's sibling rule: object paths, never URLs (07 §5.3 rule 1)
  constraint development_images_path_is_object_path_check
    check (storage_path !~ '^[a-z]+://')
);

comment on table public.development_images is
  '02 §4.6 / ADR-061: every child-tied object in the development-images bucket. A row with child_id null is a chat attachment; compact-daily purges those older than config.app.chatAttachmentTtlDays.';

create index if not exists development_images_child_idx on public.development_images (child_id)
  where child_id is not null and deleted_at is null;
create index if not exists development_images_unlinked_idx on public.development_images (created_at)
  where child_id is null;
create index if not exists development_images_consent_idx on public.development_images (consent_record_id)
  where consent_record_id is not null;

alter table public.children
  drop constraint if exists children_profile_image_id_fkey;
alter table public.children
  add constraint children_profile_image_id_fkey
  foreign key (profile_image_id) references public.development_images (id) on delete set null;

create index if not exists children_profile_image_idx on public.children (profile_image_id)
  where profile_image_id is not null;

-- ---------------------------------------------------------------------------
-- 5. `milestones` (02 §4.6 "development records" row 1) — the 210-row library.
--    Ids never change: Katie and progress_history reference them (02 §4.6).
--    Carried verbatim from Sydney's expand-milestones-210.sql; only the age
--    bracket is re-keyed from its prose form ('0-3 months') to the `age_bracket`
--    enum of 02 §3 ('0-3'). The framework's label is config.app.frameworkLabel.
-- ---------------------------------------------------------------------------

create table if not exists public.milestones (
  id          text        primary key,
  domain      public.dev_domain not null,
  age_bracket public.age_bracket not null,
  description text        not null,
  sort_order  integer     not null,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),

  constraint milestones_id_shape_check check (id ~ '^[A-Z]+-[0-9]+-[A-Z]$')
);

comment on table public.milestones is
  '02 §4.6: 7 domains x 6 age brackets x 5 milestones. Seed only; a row is deactivated, never deleted, because progress_history and Katie cite ids.';

create index if not exists milestones_domain_bracket_idx
  on public.milestones (domain, age_bracket, sort_order);

insert into public.milestones (id, domain, age_bracket, description, sort_order)
values
  ('CL-03-A', 'CL', '0-3', 'Expresses needs through cries', 1),
  ('CL-03-B', 'CL', '0-3', 'Makes throaty noises when content', 2),
  ('CL-03-C', 'CL', '0-3', 'Soothed by familiar voices', 3),
  ('CL-03-D', 'CL', '0-3', 'Begins to coo and gurgle', 4),
  ('CL-03-E', 'CL', '0-3', 'May copy simple sounds', 5),
  ('PSE-03-A', 'PSE', '0-3', 'Smiles at people', 6),
  ('PSE-03-B', 'PSE', '0-3', 'Makes eye contact', 7),
  ('PSE-03-C', 'PSE', '0-3', 'Shows excitement at feeding time', 8),
  ('PSE-03-D', 'PSE', '0-3', 'Bonds with caregivers', 9),
  ('PSE-03-E', 'PSE', '0-3', 'Cries when needs are unmet', 10),
  ('PD-03-A', 'PD', '0-3', 'Lifts head and chest when on stomach', 11),
  ('PD-03-B', 'PD', '0-3', 'Moves arms and legs actively', 12),
  ('PD-03-C', 'PD', '0-3', 'Grasps objects with hands', 13),
  ('PD-03-D', 'PD', '0-3', 'Turns head towards sounds', 14),
  ('PD-03-E', 'PD', '0-3', 'Starts to roll over', 15),
  ('LIT-03-A', 'LIT', '0-3', 'Listens to voices and sounds', 16),
  ('LIT-03-B', 'LIT', '0-3', 'Recognizes familiar voices', 17),
  ('LIT-03-C', 'LIT', '0-3', 'Exposed to books and stories', 18),
  ('LIT-03-D', 'LIT', '0-3', 'Associates sounds with actions', 19),
  ('LIT-03-E', 'LIT', '0-3', 'Develops early communication skills for literacy', 20),
  ('NUM-03-A', 'NUM', '0-3', 'Notices patterns and routines', 21),
  ('NUM-03-B', 'NUM', '0-3', 'Recognizes faces and objects', 22),
  ('NUM-03-C', 'NUM', '0-3', 'Begins object permanence', 23),
  ('NUM-03-D', 'NUM', '0-3', 'Explores environment with senses', 24),
  ('NUM-03-E', 'NUM', '0-3', 'Understands basic cause and effect', 25),
  ('UW-03-A', 'UW', '0-3', 'Alert to faces and voices', 26),
  ('UW-03-B', 'UW', '0-3', 'Follows objects with eyes', 27),
  ('UW-03-C', 'UW', '0-3', 'Reaches for toys', 28),
  ('UW-03-D', 'UW', '0-3', 'Explores objects by mouthing', 29),
  ('UW-03-E', 'UW', '0-3', 'Shows interest in new stimuli', 30),
  ('EAD-03-A', 'EAD', '0-3', 'Coos as early musical expression', 31),
  ('EAD-03-B', 'EAD', '0-3', 'Moves arms/legs rhythmically', 32),
  ('EAD-03-C', 'EAD', '0-3', 'Explores textures with hands/mouth', 33),
  ('EAD-03-D', 'EAD', '0-3', 'Imitates facial expressions', 34),
  ('EAD-03-E', 'EAD', '0-3', 'Shows interest in colorful objects/lights', 35),
  ('CL-36-A', 'CL', '3-6', 'Babbles with complex sounds', 36),
  ('CL-36-B', 'CL', '3-6', 'Responds to name', 37),
  ('CL-36-C', 'CL', '3-6', 'Smiles at mirror image', 38),
  ('CL-36-D', 'CL', '3-6', 'Enjoys peek-a-boo games', 39),
  ('CL-36-E', 'CL', '3-6', 'Copies sounds and gestures', 40),
  ('PSE-36-A', 'PSE', '3-6', 'Laughs and shows pleasure', 41),
  ('PSE-36-B', 'PSE', '3-6', 'Reaches to be picked up', 42),
  ('PSE-36-C', 'PSE', '3-6', 'Shows wariness of strangers', 43),
  ('PSE-36-D', 'PSE', '3-6', 'Enjoys social interactions', 44),
  ('PSE-36-E', 'PSE', '3-6', 'May cry when parent leaves', 45),
  ('PD-36-A', 'PD', '3-6', 'Sits with support', 46),
  ('PD-36-B', 'PD', '3-6', 'Rolls back to stomach and vice versa', 47),
  ('PD-36-C', 'PD', '3-6', 'Grasps objects with both hands', 48),
  ('PD-36-D', 'PD', '3-6', 'Transfers objects hand-to-hand', 49),
  ('PD-36-E', 'PD', '3-6', 'Begins to crawl or scoot', 50),
  ('LIT-36-A', 'LIT', '3-6', 'Looks at pictures in books', 51),
  ('LIT-36-B', 'LIT', '3-6', 'Listens to stories and rhymes', 52),
  ('LIT-36-C', 'LIT', '3-6', 'Associates words with pictures', 53),
  ('LIT-36-D', 'LIT', '3-6', 'Responds to questions with gestures/sounds', 54),
  ('LIT-36-E', 'LIT', '3-6', 'Enjoys being read to', 55),
  ('NUM-36-A', 'NUM', '3-6', 'Explores objects by size/shape', 56),
  ('NUM-36-B', 'NUM', '3-6', 'Recognizes familiar objects/people', 57),
  ('NUM-36-C', 'NUM', '3-6', 'Understands simple routines', 58),
  ('NUM-36-D', 'NUM', '3-6', 'Develops object permanence', 59),
  ('NUM-36-E', 'NUM', '3-6', 'Explores cause and effect', 60),
  ('UW-36-A', 'UW', '3-6', 'Explores by shaking/banging objects', 61),
  ('UW-36-B', 'UW', '3-6', 'Shows curiosity about new things', 62),
  ('UW-36-C', 'UW', '3-6', 'Understands actions have consequences', 63),
  ('UW-36-D', 'UW', '3-6', 'May imitate simple actions', 64),
  ('UW-36-E', 'UW', '3-6', 'Develops hand-eye coordination', 65),
  ('EAD-36-A', 'EAD', '3-6', 'Makes noises with toys', 66),
  ('EAD-36-B', 'EAD', '3-6', 'Scribbles with crayon if held', 67),
  ('EAD-36-C', 'EAD', '3-6', 'Explores textures/materials', 68),
  ('EAD-36-D', 'EAD', '3-6', 'Shows interest in music/rhythms', 69),
  ('EAD-36-E', 'EAD', '3-6', 'Imitates simple songs/rhymes', 70),
  ('CL-612-A', 'CL', '6-12', 'Says first words', 71),
  ('CL-612-B', 'CL', '6-12', 'Understands simple instructions', 72),
  ('CL-612-C', 'CL', '6-12', 'Uses gestures', 73),
  ('CL-612-D', 'CL', '6-12', 'Babbles with inflection', 74),
  ('CL-612-E', 'CL', '6-12', 'Responds to simple words', 75),
  ('PSE-612-A', 'PSE', '6-12', 'Shows separation anxiety', 76),
  ('PSE-612-B', 'PSE', '6-12', 'Plays peek-a-boo games', 77),
  ('PSE-612-C', 'PSE', '6-12', 'Waves bye-bye', 78),
  ('PSE-612-D', 'PSE', '6-12', 'Claps hands when happy', 79),
  ('PSE-612-E', 'PSE', '6-12', 'Shows empathy/concern for others', 80),
  ('PD-612-A', 'PD', '6-12', 'Crawls efficiently', 81),
  ('PD-612-B', 'PD', '6-12', 'Pulls to stand, may take steps with support', 82),
  ('PD-612-C', 'PD', '6-12', 'Uses pincer grasp for small objects', 83),
  ('PD-612-D', 'PD', '6-12', 'Throws objects', 84),
  ('PD-612-E', 'PD', '6-12', 'Sits without support', 85),
  ('LIT-612-A', 'LIT', '6-12', 'Turns book pages with help', 86),
  ('LIT-612-B', 'LIT', '6-12', 'Points to named pictures', 87),
  ('LIT-612-C', 'LIT', '6-12', 'Engages when being read to', 88),
  ('LIT-612-D', 'LIT', '6-12', '''''Reads'''' books by naming pictures', 89),
  ('LIT-612-E', 'LIT', '6-12', 'Understands pictures represent objects', 90),
  ('NUM-612-A', 'NUM', '6-12', 'Stacks blocks or cups', 91),
  ('NUM-612-B', 'NUM', '6-12', 'Understands ''''more'''' or ''''all gone''''', 92),
  ('NUM-612-C', 'NUM', '6-12', 'Points to one object when asked', 93),
  ('NUM-612-D', 'NUM', '6-12', 'Explores nesting toys/shape sorters', 94),
  ('NUM-612-E', 'NUM', '6-12', 'Understands simple counting', 95),
  ('UW-612-A', 'UW', '6-12', 'Searches for hidden objects', 96),
  ('UW-612-B', 'UW', '6-12', 'Imitates actions and sounds', 97),
  ('UW-612-C', 'UW', '6-12', 'Explores textures/materials', 98),
  ('UW-612-D', 'UW', '6-12', 'Understands cause/effect', 99),
  ('UW-612-E', 'UW', '6-12', 'Shows interest in animal sounds', 100),
  ('EAD-612-A', 'EAD', '6-12', 'Scribbles with crayons', 101),
  ('EAD-612-B', 'EAD', '6-12', 'Plays with water/sand', 102),
  ('EAD-612-C', 'EAD', '6-12', 'Imitates drawing lines/circles', 103),
  ('EAD-612-D', 'EAD', '6-12', 'Makes sounds with household items', 104),
  ('EAD-612-E', 'EAD', '6-12', 'Engages in simple pretend play', 105),
  ('CL-1218-A', 'CL', '12-18', 'Says 15+ single words', 106),
  ('CL-1218-B', 'CL', '12-18', 'Uses simple phrases', 107),
  ('CL-1218-C', 'CL', '12-18', 'Follows simple instructions', 108),
  ('CL-1218-D', 'CL', '12-18', 'Points to named objects/pictures', 109),
  ('CL-1218-E', 'CL', '12-18', 'Asks for things by name', 110),
  ('PSE-1218-A', 'PSE', '12-18', 'Engages in parallel play', 111),
  ('PSE-1218-B', 'PSE', '12-18', 'Shows independence', 112),
  ('PSE-1218-C', 'PSE', '12-18', 'Has tantrums when frustrated', 113),
  ('PSE-1218-D', 'PSE', '12-18', 'Seeks comfort from adults', 114),
  ('PSE-1218-E', 'PSE', '12-18', 'Shows possessiveness (''''mine'''')', 115),
  ('PD-1218-A', 'PD', '12-18', 'Walks alone, may run', 116),
  ('PD-1218-B', 'PD', '12-18', 'Climbs on furniture', 117),
  ('PD-1218-C', 'PD', '12-18', 'Kicks ball forward', 118),
  ('PD-1218-D', 'PD', '12-18', 'Feeds self with fingers/spoon', 119),
  ('PD-1218-E', 'PD', '12-18', 'Stacks several blocks', 120),
  ('LIT-1218-A', 'LIT', '12-18', 'Turns book pages one at a time', 121),
  ('LIT-1218-B', 'LIT', '12-18', 'Names pictures in books', 122),
  ('LIT-1218-C', 'LIT', '12-18', 'Enjoys ''''reading'''' familiar books', 123),
  ('LIT-1218-D', 'LIT', '12-18', 'Recognizes some letters/logos', 124),
  ('LIT-1218-E', 'LIT', '12-18', 'Pretends to write/draw letters', 125),
  ('NUM-1218-A', 'NUM', '12-18', 'Points to one named object', 126),
  ('NUM-1218-B', 'NUM', '12-18', 'Sorts by shape/color', 127),
  ('NUM-1218-C', 'NUM', '12-18', 'Counts two/three objects with help', 128),
  ('NUM-1218-D', 'NUM', '12-18', 'Understands ''''big'''' and ''''little''''', 129),
  ('NUM-1218-E', 'NUM', '12-18', 'Uses shape sorters/puzzles', 130),
  ('UW-1218-A', 'UW', '12-18', 'Explores object functions', 131),
  ('UW-1218-B', 'UW', '12-18', 'Imitates adult activities', 132),
  ('UW-1218-C', 'UW', '12-18', 'Shows environmental curiosity', 133),
  ('UW-1218-D', 'UW', '12-18', 'Understands simple time concepts', 134),
  ('UW-1218-E', 'UW', '12-18', 'Engages in pretend play', 135),
  ('EAD-1218-A', 'EAD', '12-18', 'Scribbles with crayons/markers', 136),
  ('EAD-1218-B', 'EAD', '12-18', 'Plays with playdough/clay', 137),
  ('EAD-1218-C', 'EAD', '12-18', 'Draws simple shapes', 138),
  ('EAD-1218-D', 'EAD', '12-18', 'Sings simple songs', 139),
  ('EAD-1218-E', 'EAD', '12-18', 'Dances to music', 140),
  ('CL-1824-A', 'CL', '18-24', 'Uses two-word phrases', 141),
  ('CL-1824-B', 'CL', '18-24', 'Follows two-step instructions', 142),
  ('CL-1824-C', 'CL', '18-24', 'Names familiar people/objects', 143),
  ('CL-1824-D', 'CL', '18-24', 'Asks ''''what''''s that?'''' or ''''where?''''', 144),
  ('CL-1824-E', 'CL', '18-24', 'Uses pronouns (e.g., ''''me,'''' ''''you'''')', 145),
  ('PSE-1824-A', 'PSE', '18-24', 'Plays alongside others, begins cooperative play', 146),
  ('PSE-1824-B', 'PSE', '18-24', 'Shows independence in dressing/self-care', 147),
  ('PSE-1824-C', 'PSE', '18-24', 'Has frequent tantrums', 148),
  ('PSE-1824-D', 'PSE', '18-24', 'Shows affection to familiar people', 149),
  ('PSE-1824-E', 'PSE', '18-24', 'Begins to understand sharing', 150),
  ('PD-1824-A', 'PD', '18-24', 'Walks up/down stairs with help', 151),
  ('PD-1824-B', 'PD', '18-24', 'Kicks ball without falling', 152),
  ('PD-1824-C', 'PD', '18-24', 'Jumps in place with both feet', 153),
  ('PD-1824-D', 'PD', '18-24', 'Feeds self with spoon', 154),
  ('PD-1824-E', 'PD', '18-24', 'Opens doors, helps with chores', 155),
  ('LIT-1824-A', 'LIT', '18-24', 'Turns book pages correctly', 156),
  ('LIT-1824-B', 'LIT', '18-24', 'Names many pictures', 157),
  ('LIT-1824-C', 'LIT', '18-24', '''''Reads'''' books from memory', 158),
  ('LIT-1824-D', 'LIT', '18-24', 'Recognizes letters in name', 159),
  ('LIT-1824-E', 'LIT', '18-24', 'Enjoys rhyming games/stories', 160),
  ('NUM-1824-A', 'NUM', '18-24', 'Counts three objects accurately', 161),
  ('NUM-1824-B', 'NUM', '18-24', 'Sorts by size/shape/color', 162),
  ('NUM-1824-C', 'NUM', '18-24', 'Understands ''''more'''' and ''''less''''', 163),
  ('NUM-1824-D', 'NUM', '18-24', 'Recognizes numbers 1-5', 164),
  ('NUM-1824-E', 'NUM', '18-24', 'Uses counting toys/books', 165),
  ('UW-1824-A', 'UW', '18-24', 'Pretends to be someone else', 166),
  ('UW-1824-B', 'UW', '18-24', 'Uses objects symbolically', 167),
  ('UW-1824-C', 'UW', '18-24', 'Imitates animal sounds', 168),
  ('UW-1824-D', 'UW', '18-24', 'Understands spatial concepts (e.g., in, on)', 169),
  ('UW-1824-E', 'UW', '18-24', 'Asks ''''why?'''' questions', 170),
  ('EAD-1824-A', 'EAD', '18-24', 'Draws controlled lines/circles', 171),
  ('EAD-1824-B', 'EAD', '18-24', 'Uses colors to represent objects', 172),
  ('EAD-1824-C', 'EAD', '18-24', 'Enjoys finger painting', 173),
  ('EAD-1824-D', 'EAD', '18-24', 'Sings songs, may create own', 174),
  ('EAD-1824-E', 'EAD', '18-24', 'Dances creatively to music', 175),
  ('CL-2432-A', 'CL', '24-32', 'Uses 2-3 word sentences', 176),
  ('CL-2432-B', 'CL', '24-32', 'Asks many questions', 177),
  ('CL-2432-C', 'CL', '24-32', 'Follows/retells simple stories', 178),
  ('CL-2432-D', 'CL', '24-32', 'Uses plurals/past tense', 179),
  ('CL-2432-E', 'CL', '24-32', 'Has conversations, takes turns', 180),
  ('PSE-2432-A', 'PSE', '24-32', 'Plays cooperatively, shares toys', 181),
  ('PSE-2432-B', 'PSE', '24-32', 'Shows empathy, comforts others', 182),
  ('PSE-2432-C', 'PSE', '24-32', 'Asserts independence (e.g., ''''I do it!'''')', 183),
  ('PSE-2432-D', 'PSE', '24-32', 'Has imaginary friends/pretend play', 184),
  ('PSE-2432-E', 'PSE', '24-32', 'Follows simple game rules', 185),
  ('PD-2432-A', 'PD', '24-32', 'Runs easily, kicks ball', 186),
  ('PD-2432-B', 'PD', '24-32', 'Jumps over small obstacles', 187),
  ('PD-2432-C', 'PD', '24-32', 'Climbs playground equipment', 188),
  ('PD-2432-D', 'PD', '24-32', 'Pedals tricycle', 189),
  ('PD-2432-E', 'PD', '24-32', 'Uses scissors to cut paper', 190),
  ('LIT-2432-A', 'LIT', '24-32', 'Recognizes/names some letters', 191),
  ('LIT-2432-B', 'LIT', '24-32', 'Scribbles own name with help', 192),
  ('LIT-2432-C', 'LIT', '24-32', 'Sits through longer stories', 193),
  ('LIT-2432-D', 'LIT', '24-32', 'Understands print has meaning', 194),
  ('LIT-2432-E', 'LIT', '24-32', '''''Writes'''' with drawings/symbols', 195),
  ('NUM-2432-A', 'NUM', '24-32', 'Counts to 10', 196),
  ('NUM-2432-B', 'NUM', '24-32', 'Sorts by multiple attributes', 197),
  ('NUM-2432-C', 'NUM', '24-32', 'Understands size/weight/length', 198),
  ('NUM-2432-D', 'NUM', '24-32', 'Uses number words in context', 199),
  ('NUM-2432-E', 'NUM', '24-32', 'Engages in math games/puzzles', 200),
  ('UW-2432-A', 'UW', '24-32', 'Knows name, age, possibly address', 201),
  ('UW-2432-B', 'UW', '24-32', 'Understands time (e.g., yesterday)', 202),
  ('UW-2432-C', 'UW', '24-32', 'Shows interest in nature', 203),
  ('UW-2432-D', 'UW', '24-32', 'Follows three-step instructions', 204),
  ('UW-2432-E', 'UW', '24-32', 'Engages in complex pretend play', 205),
  ('EAD-2432-A', 'EAD', '24-32', 'Draws symbolic people/objects', 206),
  ('EAD-2432-B', 'EAD', '24-32', 'Uses various art materials', 207),
  ('EAD-2432-C', 'EAD', '24-32', 'Sings songs with actions', 208),
  ('EAD-2432-D', 'EAD', '24-32', 'Enjoys role-playing/dressing up', 209),
  ('EAD-2432-E', 'EAD', '24-32', 'Creates patterns in art/music', 210)
on conflict (id) do update set
  domain      = excluded.domain,
  age_bracket = excluded.age_bracket,
  description = excluded.description,
  sort_order  = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 6. The development records (02 §4.6 rows 2-4).
-- ---------------------------------------------------------------------------

create table if not exists public.feed_posts (
  id             uuid        primary key default gen_random_uuid(),
  child_id       uuid        not null references public.children (id) on delete cascade,
  author_user_id uuid        references auth.users (id) on delete set null,
  type           public.post_type not null,
  context        public.post_context not null default 'adhoc',
  status         public.post_status not null default 'completed',
  parent_post_id uuid        references public.feed_posts (id) on delete set null,
  data           jsonb       not null default '{}'::jsonb,
  image_id       uuid        references public.development_images (id) on delete set null,
  internal_notes text,
  is_active      boolean     not null default true,
  source         public.post_source not null default 'manual',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.feed_posts.internal_notes is
  '02 §4.6: Katie-private. Never in a user-facing select - the exclusion is pinned by a test, and by the fact that every user-facing read goes through the module read model.';
comment on column public.feed_posts.image_id is
  '02 §4.6: writing this requires a live media consent; the gate is in the module action (the consent row is per child, and which AGR applies is a Phase 3 legal question).';

create index if not exists feed_posts_child_idx on public.feed_posts (child_id, created_at desc)
  where is_active;
create index if not exists feed_posts_author_idx on public.feed_posts (author_user_id)
  where author_user_id is not null;
create index if not exists feed_posts_parent_post_idx on public.feed_posts (parent_post_id)
  where parent_post_id is not null;
create index if not exists feed_posts_image_idx on public.feed_posts (image_id)
  where image_id is not null;

drop trigger if exists feed_posts_set_updated_at on public.feed_posts;
create trigger feed_posts_set_updated_at
  before update on public.feed_posts
  for each row execute function public.set_updated_at();

create table if not exists public.progress_scores (
  child_id   uuid        not null references public.children (id) on delete cascade,
  domain     public.dev_domain not null,
  scores     jsonb       not null default '{}'::jsonb,
  percent    numeric(5, 2) not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint progress_scores_pkey primary key (child_id, domain),
  constraint progress_scores_percent_check check (percent >= 0 and percent <= 100)
);

comment on table public.progress_scores is
  '02 §4.6: current mastery per (child, domain). **Scores only go up** - the recompute takes max(old, new), so a quiet week never reads as a regression.';

drop trigger if exists progress_scores_set_updated_at on public.progress_scores;
create trigger progress_scores_set_updated_at
  before update on public.progress_scores
  for each row execute function public.set_updated_at();

create table if not exists public.progress_history (
  id          uuid        primary key default gen_random_uuid(),
  child_id    uuid        not null references public.children (id) on delete cascade,
  ref_post_id uuid        references public.feed_posts (id) on delete set null,
  totals      jsonb       not null,
  created_at  timestamptz not null default now()
);

comment on table public.progress_history is
  '02 §4.6: a snapshot after every scoring event, insert-only. `totals` is per-domain.';

create index if not exists progress_history_child_idx on public.progress_history (child_id, created_at desc);
create index if not exists progress_history_ref_post_idx on public.progress_history (ref_post_id)
  where ref_post_id is not null;

-- ---------------------------------------------------------------------------
-- 7. The deferred FK from 0010 (02 §6 row 0012).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscribe_invites_child_id_fkey') then
    alter table public.subscribe_invites
      add constraint subscribe_invites_child_id_fkey
      foreign key (child_id) references public.children (id) on delete cascade;
  end if;
end
$$;

create index if not exists subscribe_invites_child_idx on public.subscribe_invites (child_id);

-- ---------------------------------------------------------------------------
-- 8. `user_has_child_access()` — the one RLS predicate for every app table
--    (02 §7): the parent of the child, a live-linked nanny, or an admin.
-- ---------------------------------------------------------------------------

create or replace function public.user_has_child_access(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_child_id is not null and (
    public.is_admin()
    or exists (select 1 from public.children c
               where c.id = p_child_id and c.parent_user_id = auth.uid())
    or exists (select 1 from public.child_client l
               where l.child_id = p_child_id and l.state = 'active'
                 and (l.nanny_user_id = auth.uid() or l.parent_user_id = auth.uid()))
  );
$$;

-- 0000 revoked EXECUTE in `public` from anon and authenticated by default (security-reviewer C1).
-- This is one of the two functions a client legitimately calls: it answers only about the caller.
revoke all on function public.user_has_child_access(uuid) from public;
grant execute on function public.user_has_child_access(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. The child-linking RPCs (02 §7). All SECURITY DEFINER, schema-qualified,
--    search_path pinned; the link and invite tables have no client write policy,
--    so these are the only road (07 §5.2 row `children · child_client ·
--    child_invites`).
-- ---------------------------------------------------------------------------

-- The placement shell rule (02 §4.6 `child_client`; stage-model O-3). Idempotent:
-- a family that already holds a non-ended placement keeps it.
create or replace function public.ensure_placement(
  p_child_id uuid,
  p_nanny_user_id uuid,
  p_parent_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_id    uuid;
  v_nanny_id     uuid;
  v_placement_id uuid;
  v_position_id  uuid;
begin
  -- FOR UPDATE on the parent row: two concurrent invite claims would otherwise both miss the
  -- placement check below and the second would die on the one-live-placement-per-parent unique
  -- (database-reviewer M-6).
  select p.id into v_parent_id from public.parents p
  where p.user_id = p_parent_user_id for update;
  select n.id into v_nanny_id  from public.nannies n where n.user_id = p_nanny_user_id;
  if v_parent_id is null or v_nanny_id is null then
    return null;  -- one side is not a marketplace party yet; nothing to hold together
  end if;

  select pl.id into v_placement_id
  from public.nanny_placements pl
  where pl.parent_id = v_parent_id and pl.state <> 'ENDED'
  limit 1;
  if v_placement_id is not null then
    return v_placement_id;
  end if;

  -- Reuse a live position rather than minting a second one: I-1 allows a parent exactly one
  -- position in DRAFT / OPEN / CONNECTING / ACTIVE, so a family that already has a draft would
  -- otherwise fail its invite claim on a unique violation (database-reviewer H-1).
  select np.id into v_position_id
  from public.nanny_positions np
  where np.parent_id = v_parent_id
    and np.stage in ('DRAFT', 'OPEN', 'CONNECTING', 'ACTIVE')
  for update;

  if v_position_id is null then
    insert into public.nanny_positions (parent_id, source, stage, activated_at, title)
    values (v_parent_id, 'invite', 'ACTIVE', now(), 'Invited family')
    returning id into v_position_id;
  else
    update public.nanny_positions
    set stage = 'ACTIVE', activated_at = coalesce(activated_at, now())
    where id = v_position_id and stage <> 'ACTIVE';
  end if;

  insert into public.nanny_placements (position_id, nanny_id, parent_id, source, state,
                                       confirmed_at, confirmed_by_role, started_at)
  values (v_position_id, v_nanny_id, v_parent_id, 'invite_shell', 'ACTIVE',
          now(), 'system', now())
  returning id into v_placement_id;

  update public.parents set current_placement_id = v_placement_id where id = v_parent_id;
  update public.nannies set current_placement_id = v_placement_id where id = v_nanny_id;

  return v_placement_id;
end;
$$;

comment on function public.ensure_placement is
  '02 §4.6 / stage-model O-3: an invite-arrived family was never matched, so it has no position and no placement - and I-3 / I-4 would then be vacuously true for it. This mints the shell so the invariants mean something. 0007''s I-3 trigger exempts an invite_shell from the *connection* half only.';

-- The only anonymous path into this cluster (02 §7). Returns what the landing
-- page renders and nothing else: no ids, no email, no parent name.
create or replace function public.get_invite_preview(p_token text)
returns table (child_first_name text, direction public.invite_direction, invited_by text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.first_name,
         i.direction,
         coalesce(up.first_name, 'A Baby Bloom member')
  from public.child_invites i
  join public.children c on c.id = i.child_id
  left join public.user_profiles up on up.user_id = i.created_by_user_id
  where i.token = p_token and i.status = 'pending';
$$;

comment on function public.get_invite_preview is
  '02 §7: the one anon path. 07 §8 row 7 rate-limits it (10/min, 60/day, 5 failed lookups -> 1 h block); the token never appears in a log line.';

revoke all on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated, service_role;

create or replace function public.get_pending_invites_for_recipient()
returns table (invite_id uuid, child_id uuid, child_first_name text,
               direction public.invite_direction, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.child_id, c.first_name, i.direction, i.created_at
  from public.child_invites i
  join public.children c on c.id = i.child_id
  where i.status = 'pending' and i.recipient_user_id = auth.uid();
$$;

revoke all on function public.get_pending_invites_for_recipient() from public;
grant execute on function public.get_pending_invites_for_recipient() to authenticated, service_role;

-- Claim (02 §7): fill the missing party, insert the link, call ensure_placement,
-- clear the soft lock. The `child.linked` event is emitted by the caller in the
-- same unit of work (R-2 / R4) - this function writes rows, not history.
create or replace function public.connect_child_invite(p_token text, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite  public.child_invites;
  v_child   public.children;
  v_nanny   uuid;
  v_parent  uuid;
  v_link_id uuid;
begin
  select * into v_invite from public.child_invites
  where token = p_token and status = 'pending' for update;
  if not found then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  select * into v_child from public.children where id = v_invite.child_id for update;

  -- The claimant's ROLE must match the side of the invite they are filling. The token is a bare
  -- share link, so without this a parent could claim a `parent_to_nanny` token and be written into
  -- `child_client.nanny_user_id` - gaining user_has_child_access on a child that is not theirs
  -- (security-reviewer H4).
  if v_invite.recipient_user_id is not null and v_invite.recipient_user_id <> p_user_id then
    raise exception 'INVITE_NOT_YOURS' using errcode = 'insufficient_privilege';
  end if;

  if v_invite.direction = 'nanny_to_parent' then
    if not exists (select 1 from public.user_roles r
                   where r.user_id = p_user_id and r.role = 'parent') then
      raise exception 'INVITE_WRONG_ROLE' using errcode = 'insufficient_privilege';
    end if;
    v_nanny  := v_invite.created_by_user_id;
    v_parent := p_user_id;
    if v_child.parent_user_id is null then
      update public.children set parent_user_id = p_user_id where id = v_child.id;
      v_child.parent_user_id := p_user_id;
    elsif v_child.parent_user_id <> p_user_id then
      raise exception 'CHILD_ALREADY_CLAIMED' using errcode = 'insufficient_privilege';
    end if;
  else
    if not exists (select 1 from public.user_roles r
                   where r.user_id = p_user_id and r.role = 'nanny') then
      raise exception 'INVITE_WRONG_ROLE' using errcode = 'insufficient_privilege';
    end if;
    v_parent := coalesce(v_child.parent_user_id, v_invite.created_by_user_id);
    v_nanny  := p_user_id;
  end if;

  if v_nanny is null or v_parent is null then
    raise exception 'INVITE_INCOMPLETE' using errcode = 'invalid_parameter_value';
  end if;
  if v_nanny = v_parent then
    raise exception 'INVITE_SELF_CLAIM' using errcode = 'invalid_parameter_value';
  end if;

  -- <= 1 active link per child. The first draft's `on conflict do nothing` then fell back to *any*
  -- active link, so a claim against an already-linked child silently rebound the incumbent nanny's
  -- row to a placement minted for the claimant and reported success (database-reviewer H-13).
  insert into public.child_client (child_id, nanny_user_id, parent_user_id, source, state)
  values (v_child.id, v_nanny, v_parent, 'invite', 'active')
  on conflict do nothing
  returning id into v_link_id;

  if v_link_id is null then
    select id into v_link_id from public.child_client
    where child_id = v_child.id and state = 'active' and nanny_user_id = v_nanny;
    if v_link_id is null then
      raise exception 'CHILD_ALREADY_LINKED' using errcode = 'unique_violation';
    end if;
  end if;

  update public.child_client
  set placement_id = public.ensure_placement(v_child.id, v_nanny, v_parent)
  where id = v_link_id;

  update public.child_invites
  set status = 'connected', connected_at = now(), connected_by_user_id = p_user_id,
      recipient_user_id = p_user_id
  where id = v_invite.id;

  update public.children
  set feed_locked_for_nanny = false, feed_locked_at = null, orphaned_at = null
  where id = v_child.id;

  return v_link_id;
end;
$$;

-- The unlink paths (02 §7). Each ENDS the link row; none deletes one.
create or replace function public.end_placement_if_no_shared_children(p_placement_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining   int;
  v_position_id uuid;
begin
  if p_placement_id is null then
    return false;
  end if;
  select count(*) into v_remaining
  from public.child_client l
  where l.placement_id = p_placement_id and l.state = 'active';
  if v_remaining > 0 then
    return false;
  end if;
  -- **Shells only.** 02 §4.6 scopes "ending the last shared child ends that placement" to the
  -- invite shell; a matched hire is a commercial fact that app child-links do not govern, and
  -- ending it here would also strand the position ACTIVE with an ACTIVE connection and no
  -- placement (database-reviewer H-10).
  update public.nanny_placements
  set state = 'ENDED', ended_at = now(), end_reason = 'natural', ended_by_role = 'system'
  where id = p_placement_id and state <> 'ENDED' and source = 'invite_shell'
  returning position_id into v_position_id;

  if v_position_id is null then
    return false;
  end if;

  -- close the shell position with it, or I-1 leaves the family unable to open a real one
  update public.nanny_positions
  set stage = 'CLOSED', closed_at = now(), close_reason = 'parent_closed'
  where id = v_position_id and source = 'invite' and stage <> 'CLOSED';

  update public.parents set current_placement_id = null where current_placement_id = p_placement_id;
  update public.nannies set current_placement_id = null where current_placement_id = p_placement_id;
  return true;
end;
$$;

create or replace function public.end_child_link(
  p_child_id uuid,
  p_ended_by public.actor_role,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.child_client;
begin
  -- A definer runs as its owner, so it has to ask the question RLS would have asked. Without this
  -- any caller could end any family's nanny link, platform-wide (security-reviewer C1).
  if not public.is_privileged_writer() and not public.user_has_child_access(p_child_id) then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  select * into v_link from public.child_client
  where child_id = p_child_id and state = 'active' for update;
  if not found then
    return null;
  end if;
  update public.child_client
  set state = 'ended', ended_at = now(), ended_by = p_ended_by, end_reason = p_reason
  where id = v_link.id;
  perform public.end_placement_if_no_shared_children(v_link.placement_id);
  return v_link.id;
end;
$$;

comment on function public.end_child_link is
  'The shared body of the two 02 §7 unlink paths, so "end the row, never delete it" is written once.';

create or replace function public.remove_nanny_from_child(p_child_id uuid, p_reason text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.end_child_link(p_child_id, 'parent', p_reason);
$$;

create or replace function public.nanny_leave_child(p_child_id uuid, p_reason text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.end_child_link(p_child_id, 'nanny', p_reason);
$$;

create or replace function public.update_soft_lock(p_child_id uuid, p_locked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The soft lock is the parent's control over what the nanny sees, so the nanny may not clear it
  -- (security-reviewer C1). The job that sets it runs as the service role and passes.
  if not public.is_privileged_writer() and not exists (
    select 1 from public.children c where c.id = p_child_id and c.parent_user_id = auth.uid()
  ) then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  update public.children
  set feed_locked_for_nanny = p_locked,
      feed_locked_at = case when p_locked then now() else null end
  where id = p_child_id;
end;
$$;

revoke all on function public.ensure_placement(uuid, uuid, uuid) from public;
revoke all on function public.connect_child_invite(text, uuid) from public;
revoke all on function public.end_placement_if_no_shared_children(uuid) from public;
revoke all on function public.end_child_link(uuid, public.actor_role, text) from public;
revoke all on function public.remove_nanny_from_child(uuid, text) from public;
revoke all on function public.nanny_leave_child(uuid, text) from public;
revoke all on function public.update_soft_lock(uuid, boolean) from public;
grant execute on function public.ensure_placement(uuid, uuid, uuid) to service_role;
grant execute on function public.connect_child_invite(text, uuid) to service_role;
grant execute on function public.end_placement_if_no_shared_children(uuid) to service_role;
grant execute on function public.end_child_link(uuid, public.actor_role, text) to service_role;
grant execute on function public.remove_nanny_from_child(uuid, text) to service_role;
grant execute on function public.nanny_leave_child(uuid, text) to service_role;
grant execute on function public.update_soft_lock(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 10. `child_client_events` (02 §7; R-2) — the second of the two views that
--     exist to widen (07 §5.1 rule 6), so security_invoker = off with the
--     child-access predicate baked in.
-- ---------------------------------------------------------------------------

-- The predicate is a set membership, not a per-row definer call: `user_has_child_access(subject_id)`
-- is opaque to the planner and forced a full scan of `events` (database-reviewer M-13). This form
-- lets `events_subject_idx` serve it. security_barrier because the view IS the access control
-- (database-reviewer H-12).
create or replace view public.child_client_events
with (security_invoker = off, security_barrier = true) as
  select e.id, e.ts, e.name, e.actor_kind, e.actor_id, e.on_behalf_of_id,
         e.subject_id                      as child_id,
         (e.props ->> 'linkId')::uuid      as link_id,
         e.props, e.request_id
  from public.events e
  where e.name like 'child.%'
    and ((select public.is_admin())
         or e.subject_id in (
              select c.id from public.children c where c.parent_user_id = (select auth.uid())
              union
              select l.child_id from public.child_client l
              where l.state = 'active'
                and (l.nanny_user_id = (select auth.uid()) or l.parent_user_id = (select auth.uid()))
            ));

revoke all on public.child_client_events from anon;
grant select on public.child_client_events to authenticated;

-- ---------------------------------------------------------------------------
-- 11. RLS (02 C-10; 07 §5.2 rows `children · child_client · child_invites`,
--     `milestones`, `feed_posts · progress_* · development_images`).
--     Links and invites are written **only** by the RPCs above, so neither
--     carries a client write policy.
-- ---------------------------------------------------------------------------

alter table public.children enable row level security;
alter table public.children force row level security;

drop policy if exists children_access_select on public.children;
create policy children_access_select on public.children
  for select to authenticated using ((select public.user_has_child_access(id)));

-- 07 §5.2: "INSERT any parent; INSERT (nanny-created child)" - either customer role
-- may create a child, and must create it as their own.
drop policy if exists children_parent_insert on public.children;
create policy children_parent_insert on public.children
  for insert to authenticated
  with check ((select public.is_parent()) and parent_user_id = (select auth.uid()));

drop policy if exists children_nanny_insert on public.children;
create policy children_nanny_insert on public.children
  for insert to authenticated
  with check ((select public.is_nanny()) and parent_user_id is null);

-- 07 §5.2's `children` row grants SELECT / INSERT / DELETE; UPDATE is not in the matrix at all,
-- and the first draft's `user_has_child_access` on both clauses let a **linked nanny** rewrite
-- `parent_user_id` to her own uid - which made her the parent, handed her the hard-DELETE policy
-- below, flipped child_has_family_access and re-pointed set_access_window. She could also clear
-- the parent's own soft lock, and move `date_of_birth`, which is ADR-083's input to the access
-- window (both reviewers, measured). feed_posts and inbox_messages got column guards; this is the
-- one that was missing.
create or replace function public.guard_children_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  if (to_jsonb(new) - 'first_name' - 'gender' - 'profile_image_id' - 'onboarded'
                    - 'date_of_birth' - 'updated_at')
       is distinct from (to_jsonb(old) - 'first_name' - 'gender' - 'profile_image_id' - 'onboarded'
                    - 'date_of_birth' - 'updated_at') then
    raise exception 'children: parent_user_id, status, orphaned_at and the feed lock are module-written (07 §5.2)'
      using errcode = 'insufficient_privilege';
  end if;
  if new.date_of_birth is distinct from old.date_of_birth
     and old.parent_user_id is distinct from auth.uid() then
    raise exception 'children.date_of_birth is the parent''s to correct (ADR-083 reads it)'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists children_guard_protected_columns on public.children;
create trigger children_guard_protected_columns
  before update on public.children
  for each row execute function public.guard_children_protected_columns();

drop policy if exists children_access_update on public.children;
create policy children_access_update on public.children
  for update to authenticated
  using ((select public.user_has_child_access(id)))
  with check ((select public.user_has_child_access(id)));

-- 07 §5.2: hard DELETE is the parent's, and only the parent of that child.
drop policy if exists children_parent_delete on public.children;
create policy children_parent_delete on public.children
  for delete to authenticated using (parent_user_id = (select auth.uid()));

alter table public.child_client enable row level security;
alter table public.child_client force row level security;

drop policy if exists child_client_party_select on public.child_client;
create policy child_client_party_select on public.child_client
  for select to authenticated
  using (nanny_user_id = (select auth.uid()) or parent_user_id = (select auth.uid())
         or (select public.is_admin()));

alter table public.child_invites enable row level security;
alter table public.child_invites force row level security;

drop policy if exists child_invites_creator_select on public.child_invites;
create policy child_invites_creator_select on public.child_invites
  for select to authenticated
  using (created_by_user_id = (select auth.uid())
         or recipient_user_id = (select auth.uid())
         or (select public.is_admin()));

alter table public.milestones enable row level security;
alter table public.milestones force row level security;

drop policy if exists milestones_authenticated_select on public.milestones;
create policy milestones_authenticated_select on public.milestones
  for select to authenticated using (is_active or (select public.is_admin()));

alter table public.feed_posts enable row level security;
alter table public.feed_posts force row level security;

drop policy if exists feed_posts_access_select on public.feed_posts;
create policy feed_posts_access_select on public.feed_posts
  for select to authenticated using ((select public.user_has_child_access(child_id)));

drop policy if exists feed_posts_access_insert on public.feed_posts;
create policy feed_posts_access_insert on public.feed_posts
  for insert to authenticated
  with check ((select public.user_has_child_access(child_id))
              and author_user_id = (select auth.uid()));

-- 07 §5.2: "feed_posts INSERT / soft-delete **own**". Two policies, not one: the author may edit
-- her own post's body and hide it; the child's parent may hide a post but not rewrite it, which the
-- first draft allowed because the guard trigger exempts `data` (security-reviewer M3).
drop policy if exists feed_posts_author_update on public.feed_posts;
create policy feed_posts_author_update on public.feed_posts
  for update to authenticated
  using (author_user_id = (select auth.uid()))
  with check (author_user_id = (select auth.uid())
              and (select public.user_has_child_access(child_id)));

drop policy if exists feed_posts_parent_hide on public.feed_posts;
create policy feed_posts_parent_hide on public.feed_posts
  for update to authenticated
  using (exists (select 1 from public.children c
                 where c.id = feed_posts.child_id and c.parent_user_id = (select auth.uid())))
  with check (exists (select 1 from public.children c
                 where c.id = feed_posts.child_id and c.parent_user_id = (select auth.uid())));

create or replace function public.guard_feed_post_soft_delete_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  if (to_jsonb(new) - 'is_active' - 'data' - 'updated_at')
       is distinct from (to_jsonb(old) - 'is_active' - 'data' - 'updated_at') then
    raise exception 'feed_posts: an author may edit data or soft-delete; nothing else (07 §5.2)'
      using errcode = 'insufficient_privilege';
  end if;
  -- only the author edits the body; the parent may hide and nothing more (security-reviewer M3)
  if new.data is distinct from old.data and old.author_user_id is distinct from auth.uid() then
    raise exception 'feed_posts.data is the author''s (07 §5.2)'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists feed_posts_guard_columns on public.feed_posts;
create trigger feed_posts_guard_columns
  before update on public.feed_posts
  for each row execute function public.guard_feed_post_soft_delete_only();

alter table public.progress_scores enable row level security;
alter table public.progress_scores force row level security;

drop policy if exists progress_scores_access_select on public.progress_scores;
create policy progress_scores_access_select on public.progress_scores
  for select to authenticated using ((select public.user_has_child_access(child_id)));

alter table public.progress_history enable row level security;
alter table public.progress_history force row level security;

drop policy if exists progress_history_access_select on public.progress_history;
create policy progress_history_access_select on public.progress_history
  for select to authenticated using ((select public.user_has_child_access(child_id)));

alter table public.development_images enable row level security;
alter table public.development_images force row level security;

drop policy if exists development_images_access_select on public.development_images;
create policy development_images_access_select on public.development_images
  for select to authenticated
  using (deleted_at is null and (
    (child_id is not null and (select public.user_has_child_access(child_id)))
    or (child_id is null and uploaded_by_user_id = (select auth.uid()))
  ));

-- ---------------------------------------------------------------------------
-- 12. Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_t text;
  v_n int;
begin
  foreach v_t in array array['children', 'child_client', 'child_invites', 'development_images',
                             'milestones', 'feed_posts', 'progress_scores', 'progress_history'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception '0012: public.% missing', v_t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception '0012: public.% must ENABLE and FORCE row level security (02 C-10)', v_t;
    end if;
  end loop;

  select count(*) into v_n from public.milestones;
  if v_n <> 210 then
    raise exception '0012: expected the 210-row milestone library (02 §4.6), found %', v_n;
  end if;
  select count(distinct domain) into v_n from public.milestones;
  if v_n <> 7 then
    raise exception '0012: expected 7 development domains, found %', v_n;
  end if;

  -- links and invites are written only by the RPCs (07 §5.2)
  foreach v_t in array array['child_client', 'child_invites'] loop
    select count(*) into v_n
    from pg_policies where schemaname = 'public' and tablename = v_t and cmd <> 'SELECT';
    if v_n <> 0 then
      raise exception '0012: public.% must be written only by the definer RPCs (02 §7, 07 §5.2)', v_t;
    end if;
  end loop;

  if to_regclass('public.child_client_one_active_per_child_idx') is null then
    raise exception '0012: <= 1 active link per child is not enforced (02 §4.6)';
  end if;
  if to_regclass('public.child_invites_one_pending_per_direction_idx') is null then
    raise exception '0012: <= 1 pending invite per (child, direction) is not enforced (02 §4.6)';
  end if;
  -- memory project_invite_token_stability
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'child_invites' and column_name = 'expires_at'
  ) then
    raise exception '0012: child_invites has no expiry column - the token is stable and revoke is the only invalidation path';
  end if;

  foreach v_t in array array[
    'public.user_has_child_access(uuid)',
    'public.connect_child_invite(text, uuid)',
    'public.get_invite_preview(text)',
    'public.get_pending_invites_for_recipient()',
    'public.ensure_placement(uuid, uuid, uuid)',
    'public.end_placement_if_no_shared_children(uuid)',
    'public.remove_nanny_from_child(uuid, text)',
    'public.nanny_leave_child(uuid, text)',
    'public.update_soft_lock(uuid, boolean)'
  ] loop
    if to_regprocedure(v_t) is null then
      raise exception '0012: RPC % missing (02 §7)', v_t;
    end if;
  end loop;

  if not exists (select 1 from pg_constraint where conname = 'subscribe_invites_child_id_fkey') then
    raise exception '0012: the deferred subscribe_invites.child_id FK was not added (02 §6 row 0012)';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'children_profile_image_id_fkey') then
    raise exception '0012: children.profile_image_id FK missing (02 §6 row 0012)';
  end if;
  if to_regclass('public.child_client_events') is null then
    raise exception '0012: the child_client_events view is missing (02 §7)';
  end if;

  -- 02 §5 row 1: the babysitting line never arrived
  foreach v_t in array array['babysitting_requests', 'bsr_time_slots', 'bsr_notifications'] loop
    if to_regclass('public.' || v_t) is not null then
      raise exception '0012: public.% must not exist (N-1, 02 §5 row 1)', v_t;
    end if;
  end loop;
end
$$;
