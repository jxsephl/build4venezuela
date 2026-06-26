create table if not exists public.project_vote_events (
  id bigserial primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  event_type text not null check (event_type in ('insert', 'delete')),
  created_at timestamptz not null default now()
);

create table if not exists public.project_comment_events (
  id bigserial primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  comment_id uuid not null,
  event_type text not null check (event_type in ('insert', 'update', 'delete')),
  created_at timestamptz not null default now()
);

create table if not exists public.project_comment_vote_events (
  id bigserial primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  comment_id uuid not null,
  event_type text not null check (event_type in ('insert', 'delete')),
  created_at timestamptz not null default now()
);

create index if not exists project_vote_events_project_id_created_at_idx on public.project_vote_events(project_id, created_at desc);
create index if not exists project_comment_events_project_id_created_at_idx on public.project_comment_events(project_id, created_at desc);
create index if not exists project_comment_vote_events_project_id_created_at_idx on public.project_comment_vote_events(project_id, created_at desc);

create or replace function public.enqueue_project_vote_event()
returns trigger
language plpgsql
as $$
declare
  affected_project_id uuid;
begin
  if tg_op = 'INSERT' then
    affected_project_id := new.project_id;
  else
    affected_project_id := old.project_id;
  end if;

  insert into public.project_vote_events (project_id, event_type)
  values (affected_project_id, lower(tg_op));

  return null;
end;
$$;

drop trigger if exists project_votes_enqueue_event on public.project_votes;
create trigger project_votes_enqueue_event
  after insert or delete on public.project_votes
  for each row
  execute function public.enqueue_project_vote_event();

create or replace function public.enqueue_project_comment_event()
returns trigger
language plpgsql
as $$
declare
  affected_project_id uuid;
  affected_comment_id uuid;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    affected_project_id := new.project_id;
    affected_comment_id := new.id;
  else
    affected_project_id := old.project_id;
    affected_comment_id := old.id;
  end if;

  insert into public.project_comment_events (project_id, comment_id, event_type)
  values (affected_project_id, affected_comment_id, lower(tg_op));

  return null;
end;
$$;

drop trigger if exists project_comments_enqueue_event on public.project_comments;
create trigger project_comments_enqueue_event
  after insert or update or delete on public.project_comments
  for each row
  execute function public.enqueue_project_comment_event();

create or replace function public.enqueue_project_comment_vote_event()
returns trigger
language plpgsql
as $$
declare
  affected_comment_id uuid;
  affected_project_id uuid;
begin
  if tg_op = 'INSERT' then
    affected_comment_id := new.comment_id;
  else
    affected_comment_id := old.comment_id;
  end if;

  select project_id into affected_project_id
  from public.project_comments
  where id = affected_comment_id;

  if affected_project_id is null then
    return null;
  end if;

  insert into public.project_comment_vote_events (
    project_id,
    comment_id,
    event_type
  ) values (
    affected_project_id,
    affected_comment_id,
    lower(tg_op)
  );

  return null;
end;
$$;

drop trigger if exists project_comment_votes_enqueue_event on public.project_comment_votes;
create trigger project_comment_votes_enqueue_event
  after insert or delete on public.project_comment_votes
  for each row
  execute function public.enqueue_project_comment_vote_event();

alter table public.project_vote_events enable row level security;
alter table public.project_comment_events enable row level security;
alter table public.project_comment_vote_events enable row level security;

drop policy if exists "Project votes are readable" on public.project_votes;
drop policy if exists "Project comments are readable" on public.project_comments;
drop policy if exists "Project comment votes are readable" on public.project_comment_votes;

drop policy if exists "Project vote events are readable" on public.project_vote_events;
create policy "Project vote events are readable"
  on public.project_vote_events for select
  using (true);

drop policy if exists "Project comment events are readable" on public.project_comment_events;
create policy "Project comment events are readable"
  on public.project_comment_events for select
  using (true);

drop policy if exists "Project comment vote events are readable" on public.project_comment_vote_events;
create policy "Project comment vote events are readable"
  on public.project_comment_vote_events for select
  using (true);

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_votes'
  ) then
    alter publication supabase_realtime drop table public.project_votes;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_comments'
  ) then
    alter publication supabase_realtime drop table public.project_comments;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_comment_votes'
  ) then
    alter publication supabase_realtime drop table public.project_comment_votes;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_vote_events'
  ) then
    alter publication supabase_realtime add table public.project_vote_events;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_comment_events'
  ) then
    alter publication supabase_realtime add table public.project_comment_events;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_comment_vote_events'
  ) then
    alter publication supabase_realtime add table public.project_comment_vote_events;
  end if;
end $$;
