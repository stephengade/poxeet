-- Planning and drafting a calendar (D-025): the plan and progress live on the calendar row, and each drafted slot
-- becomes one scheduled post. Drafting goes a week at a time and can resume after a failure (PRD CAL-2).

alter table public.calendars
  add column status text not null default 'ready' check (status in ('planning', 'drafting', 'ready', 'failed')),
  -- The planner's slots: [{ index, date, time, week, pillar, post_type, topic_angle }], dates in the member's timezone.
  add column plan jsonb not null default '[]'::jsonb,
  add column timezone text not null default 'UTC',
  add column weeks_total integer not null default 0 check (weeks_total >= 0),
  add column weeks_done integer not null default 0 check (weeks_done >= 0),
  add column reason text,
  add column message text,
  add column updated_at timestamptz not null default now();

alter table public.scheduled_posts
  add column slot_index integer,
  add column hook text,
  -- The drafter's question when a post needs a fact only the member knows (PRD section 8).
  add column needs_user_input text;

-- One post per planned slot, so a week drafted twice (a retry) never doubles up. A plain constraint (not a partial
-- index) so upserts can target it; rows without a slot (posts written by hand) have nulls, which never conflict.
alter table public.scheduled_posts add constraint scheduled_posts_calendar_slot unique (calendar_id, slot_index);
