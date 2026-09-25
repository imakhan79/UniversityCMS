-- ============================================================================
-- MIGRATION 008 — Campus Life
-- Zicon UMS
--
-- Creates: hostels, hostel_rooms, hostel_allocations, transport_routes,
-- transport_allocations, library_books, library_issues, events,
-- discipline_cases.
-- ============================================================================

create type public.hostel_gender as enum ('male', 'female', 'mixed');
create type public.room_type as enum ('single', 'double', 'triple', 'dormitory');
create type public.allocation_status as enum ('active', 'vacated', 'cancelled');
create type public.library_issue_status as enum ('issued', 'returned', 'overdue', 'lost');
create type public.event_type as enum ('academic', 'cultural', 'sports', 'seminar', 'workshop', 'other');
create type public.discipline_severity as enum ('minor', 'moderate', 'severe');
create type public.discipline_status as enum ('reported', 'under_investigation', 'resolved', 'dismissed');

-- ----------------------------------------------------------------------------
-- hostels / hostel_rooms / hostel_allocations
-- There is no dedicated "warden" role in app_role, so hostel management
-- falls to admin/registrar.
-- ----------------------------------------------------------------------------

create table public.hostels (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  campus_id uuid references public.campuses(id),
  name text not null,
  warden_id uuid references auth.users(id),
  gender public.hostel_gender not null default 'mixed',
  total_capacity integer not null default 0,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_hostels_university_id on public.hostels (university_id);
create index idx_hostels_campus_id on public.hostels (campus_id);

alter table public.hostels enable row level security;

create policy hostels_select on public.hostels
  for select using (public.is_member_of_university(university_id));

create policy hostels_write on public.hostels
  for all using (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id));

select public.attach_standard_triggers('public.hostels');

create table public.hostel_rooms (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  hostel_id uuid not null references public.hostels(id) on delete cascade,
  room_number text not null,
  floor integer,
  room_type public.room_type not null default 'double',
  capacity integer not null default 2,
  occupied_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (hostel_id, room_number)
);

create index idx_hostel_rooms_university_id on public.hostel_rooms (university_id);
create index idx_hostel_rooms_hostel_id on public.hostel_rooms (hostel_id);

alter table public.hostel_rooms enable row level security;

create policy hostel_rooms_select on public.hostel_rooms
  for select using (public.is_member_of_university(university_id));

create policy hostel_rooms_write on public.hostel_rooms
  for all using (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id));

select public.attach_standard_triggers('public.hostel_rooms');

create table public.hostel_allocations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  hostel_room_id uuid not null references public.hostel_rooms(id) on delete cascade,
  status public.allocation_status not null default 'active',
  allocated_at timestamptz not null default now(),
  vacated_at timestamptz,
  allocated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create unique index uq_hostel_allocations_active_student
  on public.hostel_allocations (student_id) where status = 'active';

create index idx_hostel_allocations_university_id on public.hostel_allocations (university_id);
create index idx_hostel_allocations_room_id on public.hostel_allocations (hostel_room_id);

alter table public.hostel_allocations enable row level security;

create policy hostel_allocations_select on public.hostel_allocations
  for select using (
    student_id = auth.uid()
    or public.is_guardian_of(student_id)
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy hostel_allocations_write on public.hostel_allocations
  for all using (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id));

select public.attach_standard_triggers('public.hostel_allocations');

-- ----------------------------------------------------------------------------
-- transport_routes / transport_allocations
-- ----------------------------------------------------------------------------

create table public.transport_routes (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  route_name text not null,
  route_code text not null,
  start_point text,
  end_point text,
  stops jsonb not null default '[]'::jsonb,
  fare numeric(10, 2) default 0,
  vehicle_number text,
  driver_name text,
  driver_contact text,
  capacity integer not null default 40,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (university_id, route_code)
);

create index idx_transport_routes_university_id on public.transport_routes (university_id);

alter table public.transport_routes enable row level security;

create policy transport_routes_select on public.transport_routes
  for select using (public.is_member_of_university(university_id));

create policy transport_routes_write on public.transport_routes
  for all using (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id));

select public.attach_standard_triggers('public.transport_routes');

create table public.transport_allocations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  transport_route_id uuid not null references public.transport_routes(id) on delete cascade,
  pickup_stop text,
  status public.allocation_status not null default 'active',
  allocated_at timestamptz not null default now(),
  allocated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create unique index uq_transport_allocations_active_student
  on public.transport_allocations (student_id) where status = 'active';

create index idx_transport_allocations_university_id on public.transport_allocations (university_id);
create index idx_transport_allocations_route_id on public.transport_allocations (transport_route_id);

alter table public.transport_allocations enable row level security;

create policy transport_allocations_select on public.transport_allocations
  for select using (
    student_id = auth.uid()
    or public.is_guardian_of(student_id)
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy transport_allocations_write on public.transport_allocations
  for all using (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id));

select public.attach_standard_triggers('public.transport_allocations');

-- ----------------------------------------------------------------------------
-- library_books / library_issues
-- ----------------------------------------------------------------------------

create table public.library_books (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  isbn text,
  title text not null,
  author text,
  publisher text,
  category text,
  total_copies integer not null default 1,
  available_copies integer not null default 1,
  shelf_location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_library_books_university_id on public.library_books (university_id);
create index idx_library_books_title on public.library_books using gin (to_tsvector('english', title));

alter table public.library_books enable row level security;

create policy library_books_select on public.library_books
  for select using (public.is_member_of_university(university_id));

create policy library_books_write on public.library_books
  for all using (public.has_any_role_in_university(array['admin', 'librarian']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'librarian']::public.app_role[], university_id));

select public.attach_standard_triggers('public.library_books');

create table public.library_issues (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  book_id uuid not null references public.library_books(id) on delete cascade,
  borrower_id uuid not null references auth.users(id) on delete cascade,
  status public.library_issue_status not null default 'issued',
  issued_at timestamptz not null default now(),
  due_date date not null,
  returned_at timestamptz,
  fine_amount numeric(10, 2) not null default 0,
  issued_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_library_issues_university_id on public.library_issues (university_id);
create index idx_library_issues_book_id on public.library_issues (book_id);
create index idx_library_issues_borrower_id on public.library_issues (borrower_id);
create index idx_library_issues_status on public.library_issues (university_id, status);

alter table public.library_issues enable row level security;

create policy library_issues_select on public.library_issues
  for select using (
    borrower_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'librarian']::public.app_role[], university_id)
  );

create policy library_issues_write on public.library_issues
  for all using (public.has_any_role_in_university(array['admin', 'librarian']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'librarian']::public.app_role[], university_id));

select public.attach_standard_triggers('public.library_issues');

-- ----------------------------------------------------------------------------
-- events
-- ----------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  campus_id uuid references public.campuses(id),
  title text not null,
  description text,
  event_type public.event_type not null default 'other',
  start_at timestamptz not null,
  end_at timestamptz,
  location text,
  organizer_id uuid references auth.users(id),
  is_public boolean not null default false,
  max_attendees integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_events_university_id on public.events (university_id);
create index idx_events_start_at on public.events (start_at);

alter table public.events enable row level security;

create policy events_select_members on public.events
  for select using (public.is_member_of_university(university_id));

create policy events_select_public on public.events
  for select using (is_public = true);

create policy events_write on public.events
  for all using (
    organizer_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  )
  with check (
    organizer_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.events');

-- ----------------------------------------------------------------------------
-- discipline_cases — confidential; deliberately narrow read access.
-- ----------------------------------------------------------------------------

create table public.discipline_cases (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  reported_by uuid references auth.users(id),
  incident_date date not null default current_date,
  description text not null,
  severity public.discipline_severity not null default 'minor',
  status public.discipline_status not null default 'reported',
  action_taken text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_discipline_cases_university_id on public.discipline_cases (university_id);
create index idx_discipline_cases_student_id on public.discipline_cases (student_id);
create index idx_discipline_cases_status on public.discipline_cases (university_id, status);

alter table public.discipline_cases enable row level security;

create policy discipline_cases_select on public.discipline_cases
  for select using (
    student_id = auth.uid()
    or reported_by = auth.uid()
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy discipline_cases_insert on public.discipline_cases
  for insert with check (public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod', 'faculty']::public.app_role[], university_id));

create policy discipline_cases_write_admin on public.discipline_cases
  for all using (public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id));

select public.attach_standard_triggers('public.discipline_cases');
