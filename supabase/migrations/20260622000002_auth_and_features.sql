-- Add HuggingFace classifier columns to the cache table.
alter table public.analyses
  add column if not exists hf_score  numeric,
  add column if not exists hf_label  text,
  add column if not exists content_type text not null default 'article',
  add column if not exists input_url text;

-- User-analysis join table. Links authenticated users to cached analyses
-- and gives each association a unique share slug.
create table if not exists public.user_analyses (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  analysis_id  uuid        not null references public.analyses(id) on delete cascade,
  share_slug   text        not null unique,
  created_at   timestamptz not null default now(),
  unique (user_id, analysis_id)
);

create index if not exists user_analyses_user_id_created_at_idx
  on public.user_analyses (user_id, created_at desc);

create index if not exists user_analyses_share_slug_idx
  on public.user_analyses (share_slug);

alter table public.user_analyses enable row level security;

-- Users can read and insert their own rows; service role bypasses this.
create policy "users_select_own"
  on public.user_analyses for select
  using (auth.uid() = user_id);

create policy "users_insert_own"
  on public.user_analyses for insert
  with check (auth.uid() = user_id);
