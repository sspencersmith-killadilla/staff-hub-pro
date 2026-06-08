-- 051_quest_prizes.sql — Prize catalog + virtual tickets minted on quest completion.

-- ─── Prize catalog ──────────────────────────────────────────────────
create table if not exists public.prizes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  fulfilled_by text not null default 'city' check (fulfilled_by in ('city','sponsor')),
  sponsor_name text,
  pickup_location text,
  total_quantity integer,
  remaining_quantity integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.prizes to anon, authenticated;
grant all on public.prizes to service_role;

alter table public.prizes enable row level security;

drop policy if exists "prizes_public_select_active" on public.prizes;
create policy "prizes_public_select_active" on public.prizes
  for select to anon, authenticated
  using (is_active or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

drop policy if exists "prizes_admin_write" on public.prizes;
create policy "prizes_admin_write" on public.prizes
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ─── Quest ↔ Prize link (which prize a quest awards on completion) ──
create table if not exists public.quest_prize_rewards (
  quest_id uuid not null references public.quests(id) on delete cascade,
  prize_id uuid not null references public.prizes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (quest_id, prize_id)
);

grant select on public.quest_prize_rewards to anon, authenticated;
grant all on public.quest_prize_rewards to service_role;

alter table public.quest_prize_rewards enable row level security;

drop policy if exists "qpr_public_select" on public.quest_prize_rewards;
create policy "qpr_public_select" on public.quest_prize_rewards
  for select to anon, authenticated using (true);

drop policy if exists "qpr_admin_write" on public.quest_prize_rewards;
create policy "qpr_admin_write" on public.quest_prize_rewards
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ─── Prize tickets (citizen wallet items) ──────────────────────────
create table if not exists public.prize_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid references public.quests(id) on delete set null,
  prize_id uuid not null references public.prizes(id) on delete restrict,
  source text not null default 'quest' check (source in ('quest','raffle')),
  serial text not null unique,
  qr_token text not null unique,
  status text not null default 'issued' check (status in ('issued','redeemed','void')),
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id)
);

create index if not exists idx_prize_tickets_user on public.prize_tickets(user_id, issued_at desc);
create unique index if not exists idx_prize_tickets_user_quest on public.prize_tickets(user_id, quest_id) where source = 'quest';

grant select on public.prize_tickets to authenticated;
grant all on public.prize_tickets to service_role;

alter table public.prize_tickets enable row level security;

drop policy if exists "tickets_owner_select" on public.prize_tickets;
create policy "tickets_owner_select" on public.prize_tickets
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
  );

drop policy if exists "tickets_staff_update" on public.prize_tickets;
create policy "tickets_staff_update" on public.prize_tickets
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

-- (No INSERT policy for citizens — minting happens via service_role server fn.)

-- ─── Helper: mint a ticket for (user, quest) if a reward is configured ──
create or replace function public.mint_quest_prize_ticket(_user_id uuid, _quest_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _prize_id uuid;
  _ticket_id uuid;
  _serial text;
  _qr text;
begin
  -- Already minted? Idempotent on (user, quest).
  select id into _ticket_id from public.prize_tickets
   where user_id = _user_id and quest_id = _quest_id and source = 'quest'
   limit 1;
  if _ticket_id is not null then
    return _ticket_id;
  end if;

  -- Pick the first active, in-stock reward for this quest.
  select p.id into _prize_id
    from public.quest_prize_rewards qpr
    join public.prizes p on p.id = qpr.prize_id
   where qpr.quest_id = _quest_id
     and p.is_active
     and (p.remaining_quantity is null or p.remaining_quantity > 0)
   limit 1;

  if _prize_id is null then
    return null;
  end if;

  _serial := 'TKT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  _qr := encode(gen_random_bytes(24), 'hex');

  insert into public.prize_tickets(user_id, quest_id, prize_id, source, serial, qr_token)
  values (_user_id, _quest_id, _prize_id, 'quest', _serial, _qr)
  returning id into _ticket_id;

  update public.prizes
     set remaining_quantity = greatest(coalesce(remaining_quantity, 0) - 1, 0),
         updated_at = now()
   where id = _prize_id and remaining_quantity is not null;

  return _ticket_id;
end$$;

grant execute on function public.mint_quest_prize_ticket(uuid, uuid) to service_role;
