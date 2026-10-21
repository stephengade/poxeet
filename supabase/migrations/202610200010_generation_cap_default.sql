-- The daily generation cap now counts instance-key calls (lib/ai/server.ts resolveAiAccess, security review
-- 2026-10-20 finding 2). Each model call is one: an 8-week plan is the planner plus up to 56 drafts, and a
-- retry is a call of its own. 20 stopped a single plan part-way, so the default goes to 100, and members still
-- on the old default move with it. Caps an admin set to anything else are left alone.
alter table public.profiles alter column daily_generation_cap set default 100;
update public.profiles set daily_generation_cap = 100 where daily_generation_cap = 20;
