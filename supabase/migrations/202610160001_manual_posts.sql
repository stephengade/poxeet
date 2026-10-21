-- Setup's voice step adds posts one at a time (D-023), saved with source 'manual'. 'paste' stays for rows saved
-- by the older one-box paste.
alter table public.imported_posts drop constraint if exists imported_posts_source_check;
alter table public.imported_posts add constraint imported_posts_source_check
  check (source in ('linkedin_export', 'paste', 'manual'));
