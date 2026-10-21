-- Members' own AI keys can come from more than one provider (D-020). Existing keys were Claude keys.
alter table public.user_api_keys
  add column provider text not null default 'anthropic' check (provider in ('anthropic', 'openai', 'deepseek')),
  add column created_at timestamptz not null default now();
