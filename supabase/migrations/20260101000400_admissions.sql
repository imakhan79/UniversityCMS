-- ============================================================================
-- MIGRATION 004 — Admissions
-- Zicon UMS
--
-- Creates: applications, application_documents, entry_tests,
-- entry_test_results, merit_lists, merit_list_entries (supporting table,
-- not in the original list, needed to rank applications within a merit
-- list), seat_allocations.
-- ============================================================================

create type public.application_status as enum (
  'draft', 'submitted', 'under_review', 'shortlisted', 'accepted',
  'rejected', 'waitlisted', 'withdrawn', 'enrolled'
);

create type public.application_document_type as enum (
  'transcript', 'recommendation_letter', 'statement_of_purpose', 'id_proof',
  'photo', 'test_score_report', 'other'
);

create type public.seat_allocation_status as enum ('allocated', 'confirmed', 'cancelled');

-- Admissions is managed by admin/registrar in this design — there is no
-- dedicated "admissions officer" role in the enum, so registrar carries it.

-- ----------------------------------------------------------------------------
-- applications
-- ----------------------------------------------------------------------------

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id),
  application_number text not null,
  intake_semester_id uuid references public.semesters(id),
  status public.application_status not null default 'draft',
  previous_education jsonb not null default '[]'::jsonb,
  personal_details jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (university_id, application_number)
);

create index idx_applications_university_id on public.applications (university_id);
create index idx_applications_applicant_id on public.applications (applicant_id);
create index idx_applications_program_id on public.applications (program_id);
create index idx_applications_status on public.applications (university_id, status);

alter table public.applications enable row level security;

create policy applications_select on public.applications
  for select using (
    applicant_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy applications_insert on public.applications
  for insert with check (
    applicant_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy applications_update_applicant on public.applications
  for update using (applicant_id = auth.uid() and status in ('draft', 'submitted'))
  with check (applicant_id = auth.uid() and status in ('draft', 'submitted', 'withdrawn'));

create policy applications_write_admin on public.applications
  for all using (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id));

select public.attach_standard_triggers('public.applications');

-- ----------------------------------------------------------------------------
-- application_documents
-- ----------------------------------------------------------------------------

create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  document_type public.application_document_type not null,
  file_path text not null,
  file_name text not null,
  verified boolean not null default false,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_application_documents_university_id on public.application_documents (university_id);
create index idx_application_documents_application_id on public.application_documents (application_id);

create or replace function public.owns_application(target_application uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.applications a
    where a.id = target_application and a.applicant_id = auth.uid()
  );
$$;

alter table public.application_documents enable row level security;

create policy application_documents_select on public.application_documents
  for select using (
    public.owns_application(application_id)
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy application_documents_insert on public.application_documents
  for insert with check (
    public.owns_application(application_id)
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy application_documents_write_admin on public.application_documents
  for all using (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id));

select public.attach_standard_triggers('public.application_documents');

-- ----------------------------------------------------------------------------
-- entry_tests
-- ----------------------------------------------------------------------------

create table public.entry_tests (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  program_id uuid references public.programs(id),
  name text not null,
  test_date date,
  total_marks numeric(6, 2) not null default 100,
  passing_marks numeric(6, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_entry_tests_university_id on public.entry_tests (university_id);
create index idx_entry_tests_program_id on public.entry_tests (program_id);

alter table public.entry_tests enable row level security;

create policy entry_tests_select on public.entry_tests
  for select using (public.is_member_of_university(university_id));

create policy entry_tests_write on public.entry_tests
  for all using (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id));

select public.attach_standard_triggers('public.entry_tests');

-- ----------------------------------------------------------------------------
-- entry_test_results
-- ----------------------------------------------------------------------------

create table public.entry_test_results (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  entry_test_id uuid not null references public.entry_tests(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  marks_obtained numeric(6, 2),
  percentile numeric(5, 2),
  passed boolean,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (entry_test_id, application_id)
);

create index idx_entry_test_results_university_id on public.entry_test_results (university_id);
create index idx_entry_test_results_application_id on public.entry_test_results (application_id);

alter table public.entry_test_results enable row level security;

create policy entry_test_results_select on public.entry_test_results
  for select using (
    public.owns_application(application_id)
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy entry_test_results_write on public.entry_test_results
  for all using (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id));

select public.attach_standard_triggers('public.entry_test_results');

-- ----------------------------------------------------------------------------
-- merit_lists
-- ----------------------------------------------------------------------------

create table public.merit_lists (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  program_id uuid not null references public.programs(id),
  intake_semester_id uuid references public.semesters(id),
  name text not null,
  is_final boolean not null default false,
  published_at timestamptz,
  published_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_merit_lists_university_id on public.merit_lists (university_id);
create index idx_merit_lists_program_id on public.merit_lists (program_id);

alter table public.merit_lists enable row level security;

create policy merit_lists_select_published on public.merit_lists
  for select using (published_at is not null and public.is_member_of_university(university_id));

create policy merit_lists_write on public.merit_lists
  for all using (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id));

select public.attach_standard_triggers('public.merit_lists');

-- ----------------------------------------------------------------------------
-- merit_list_entries
-- ----------------------------------------------------------------------------

create table public.merit_list_entries (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  merit_list_id uuid not null references public.merit_lists(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  rank integer not null,
  score numeric(6, 2),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (merit_list_id, application_id),
  unique (merit_list_id, rank)
);

create index idx_merit_list_entries_merit_list_id on public.merit_list_entries (merit_list_id);
create index idx_merit_list_entries_application_id on public.merit_list_entries (application_id);

alter table public.merit_list_entries enable row level security;

create policy merit_list_entries_select on public.merit_list_entries
  for select using (
    public.owns_application(application_id)
    or exists (
      select 1 from public.merit_lists ml
      where ml.id = merit_list_id and ml.published_at is not null and public.is_member_of_university(ml.university_id)
    )
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy merit_list_entries_write on public.merit_list_entries
  for all using (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id));

-- ----------------------------------------------------------------------------
-- seat_allocations
-- ----------------------------------------------------------------------------

create table public.seat_allocations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  program_id uuid not null references public.programs(id),
  intake_semester_id uuid references public.semesters(id),
  seat_category text default 'open',
  status public.seat_allocation_status not null default 'allocated',
  allocated_at timestamptz not null default now(),
  allocated_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (application_id)
);

create index idx_seat_allocations_university_id on public.seat_allocations (university_id);
create index idx_seat_allocations_program_id on public.seat_allocations (program_id);

alter table public.seat_allocations enable row level security;

create policy seat_allocations_select on public.seat_allocations
  for select using (
    public.owns_application(application_id)
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy seat_allocations_write on public.seat_allocations
  for all using (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id));

select public.attach_standard_triggers('public.seat_allocations');
