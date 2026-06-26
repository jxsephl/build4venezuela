create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_user_id text not null,
  author_name text not null,
  body text not null check (char_length(trim(body)) between 3 and 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_comment_votes (
  comment_id uuid not null references public.project_comments(id) on delete cascade,
  voter_id text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, voter_id)
);

create index if not exists project_comments_project_id_created_at_idx on public.project_comments(project_id, created_at);
create index if not exists project_comment_votes_comment_id_idx on public.project_comment_votes(comment_id);

drop trigger if exists project_comments_touch_updated_at on public.project_comments;
create trigger project_comments_touch_updated_at
  before update on public.project_comments
  for each row
  execute function public.touch_updated_at();

alter table public.project_comments enable row level security;
alter table public.project_comment_votes enable row level security;

drop policy if exists "Project comments are readable" on public.project_comments;
create policy "Project comments are readable"
  on public.project_comments for select
  using (true);

drop policy if exists "Project comment votes are readable" on public.project_comment_votes;
create policy "Project comment votes are readable"
  on public.project_comment_votes for select
  using (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_comments'
  ) then
    alter publication supabase_realtime add table public.project_comments;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_comment_votes'
  ) then
    alter publication supabase_realtime add table public.project_comment_votes;
  end if;
end $$;
