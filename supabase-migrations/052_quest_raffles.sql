-- 052_quest_raffles.sql — Raffles + entries earned from completing linked quests.

create table if not exists public.raffles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  prize_id uuid references public.prizes(id) on delete set null,
  draw_date timestamptz,
  winners_count integer not null default 1,
  status text not null default 'open' check (status in ('open','drawn','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.raffles to anon, authenticated;
grant all on public.raffles to service_role;

alter table public.raffles enable row level security;

drop policy if exists "raffles_public_select" on public.raffles;
create policy "raffles_public_select" on public.raffles
  for select to anon, authenticated using (true);

drop policy if exists "raffles_admin_write" on public.raffles;
create policy "raffles_admin_write" on public.raffles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Which quests award entries to which raffle.
create table if not exists public.raffle_quests (
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  quest_id  uuid not null references public.quests(id)  on delete cascade,
  entries_per_completion integer not null default 1,
  primary key (raffle_id, quest_id)
);

grant select on public.raffle_quests to anon, authenticated;
grant all on public.raffle_quests to service_role;

alter table public.raffle_quests enable row level security;

drop policy if exists "raffle_quests_public_select" on public.raffle_quests;
create policy "raffle_quests_public_select" on public.raffle_quests
  for select to anon, authenticated using (true);

drop policy if exists "raffle_quests_admin_write" on public.raffle_quests;
create policy "raffle_quests_admin_write" on public.raffle_quests
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Entries earned per user per raffle.
create table if not exists public.raffle_entries (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid references public.quests(id) on delete set null,
  earned_at timestamptz not null default now()
);

create index if not exists idx_raffle_entries_raffle on public.raffle_entries(raffle_id);
create index if not exists idx_raffle_entries_user on public.raffle_entries(user_id);

grant select on public.raffle_entries to authenticated;
grant all on public.raffle_entries to service_role;

alter table public.raffle_entries enable row level security;

drop policy if exists "raffle_entries_owner_select" on public.raffle_entries;
create policy "raffle_entries_owner_select" on public.raffle_entries
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
  );

-- Winners selected at draw time.
create table if not exists public.raffle_winners (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid references public.prize_tickets(id) on delete set null,
  drawn_at timestamptz not null default now(),
  notified boolean not null default false
);

create index if not exists idx_raffle_winners_raffle on public.raffle_winners(raffle_id);

grant select on public.raffle_winners to authenticated;
grant all on public.raffle_winners to service_role;

alter table public.raffle_winners enable row level security;

drop policy if exists "raffle_winners_select" on public.raffle_winners;
create policy "raffle_winners_select" on public.raffle_winners
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
  );

-- Helper: grant entries when a user just completed a quest.
create or replace function public.grant_raffle_entries_for_quest(_user_id uuid, _quest_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _granted integer := 0;
  _row record;
  _i integer;
begin
  for _row in
    select rq.raffle_id, rq.entries_per_completion
      from public.raffle_quests rq
      join public.raffles r on r.id = rq.raffle_id
     where rq.quest_id = _quest_id
       and r.status = 'open'
  loop
    for _i in 1.._row.entries_per_completion loop
      insert into public.raffle_entries(raffle_id, user_id, quest_id)
      values (_row.raffle_id, _user_id, _quest_id);
      _granted := _granted + 1;
    end loop;
  end loop;
  return _granted;
end$$;

grant execute on function public.grant_raffle_entries_for_quest(uuid, uuid) to service_role;

-- Helper: draw winners (random distinct users) for a raffle.
create or replace function public.draw_raffle_winners(_raffle_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _count integer;
  _prize_id uuid;
  _winner record;
  _drawn integer := 0;
  _ticket_id uuid;
  _serial text;
  _qr text;
begin
  select winners_count, prize_id into _count, _prize_id
    from public.raffles where id = _raffle_id and status = 'open';
  if _count is null then
    return 0;
  end if;

  for _winner in
    select user_id
      from public.raffle_entries
     where raffle_id = _raffle_id
     group by user_id
     order by random()
     limit _count
  loop
    -- Mint a raffle ticket if a prize is linked.
    if _prize_id is not null then
      _serial := 'RAF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      _qr := encode(gen_random_bytes(24), 'hex');
      insert into public.prize_tickets(user_id, prize_id, source, serial, qr_token)
      values (_winner.user_id, _prize_id, 'raffle', _serial, _qr)
      returning id into _ticket_id;
    else
      _ticket_id := null;
    end if;

    insert into public.raffle_winners(raffle_id, user_id, ticket_id)
    values (_raffle_id, _winner.user_id, _ticket_id);
    _drawn := _drawn + 1;
  end loop;

  update public.raffles set status = 'drawn', updated_at = now() where id = _raffle_id;
  return _drawn;
end$$;

grant execute on function public.draw_raffle_winners(uuid) to service_role;
