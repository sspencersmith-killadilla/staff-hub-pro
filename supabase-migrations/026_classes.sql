-- Class Registration module
-- Tables: courses, course_sessions, enrollments
-- Each scheduled course_session links to an auto-created approved row in
-- room_reservations so it blocks the master availability calendar.

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  price numeric(10,2) not null default 0,
  department_id uuid references public.departments(id) on delete set null,
  image_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  instructor_id uuid references auth.users(id) on delete set null,
  instructor_name text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  capacity integer not null default 20,
  created_at timestamptz not null default now(),
  constraint course_sessions_time_order check (end_time > start_time)
);

create index if not exists course_sessions_course_idx on public.course_sessions(course_id);
create index if not exists course_sessions_room_time_idx on public.course_sessions(room_id, start_time);
create index if not exists courses_department_idx on public.courses(department_id);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.course_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text,
  email text,
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','free','refunded','failed')),
  attended boolean not null default false,
  amount_cents integer,
  transaction_ref text,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists enrollments_session_idx on public.enrollments(session_id);
create index if not exists enrollments_user_idx on public.enrollments(user_id);

-- Link reservations to the course_session that created them (so we can
-- cascade updates/cleanups).
alter table public.room_reservations
  add column if not exists course_session_id uuid references public.course_sessions(id) on delete cascade;

-- Grants
grant select on public.courses to anon, authenticated;
grant insert, update, delete on public.courses to authenticated;
grant all on public.courses to service_role;

grant select on public.course_sessions to anon, authenticated;
grant insert, update, delete on public.course_sessions to authenticated;
grant all on public.course_sessions to service_role;

grant select, insert, update, delete on public.enrollments to authenticated;
grant all on public.enrollments to service_role;

-- RLS
alter table public.courses enable row level security;
alter table public.course_sessions enable row level security;
alter table public.enrollments enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
    where schemaname='public' and tablename in ('courses','course_sessions','enrollments')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end$$;

-- Public read for catalog
create policy "public read courses" on public.courses
  for select using (true);
create policy "public read course_sessions" on public.course_sessions
  for select using (true);

-- Staff/admin manage
create policy "staff manage courses" on public.courses
  for all using (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'));
create policy "staff manage course_sessions" on public.course_sessions
  for all using (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'));

-- Enrollments: user can read/insert own; instructors+staff read all
create policy "user reads own enrollment" on public.enrollments
  for select using (auth.uid() = user_id);
create policy "user creates own enrollment" on public.enrollments
  for insert with check (auth.uid() = user_id);
create policy "staff manage enrollments" on public.enrollments
  for all using (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'));
create policy "instructor reads roster" on public.enrollments
  for select using (
    exists (
      select 1 from public.course_sessions cs
      where cs.id = enrollments.session_id and cs.instructor_id = auth.uid()
    )
  );
