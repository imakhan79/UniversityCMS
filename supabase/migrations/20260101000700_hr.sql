-- ============================================================================
-- MIGRATION 007 — HR
-- Zicon UMS
--
-- Creates: employees, recruitment, leave_requests, appraisals, trainings,
-- training_enrollments (supporting table, needed to link employees to the
-- trainings they attend), publications.
-- ============================================================================

create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'visiting');
create type public.employment_status as enum ('active', 'on_leave', 'suspended', 'terminated', 'retired');
create type public.recruitment_status as enum ('open', 'closed', 'on_hold');
create type public.leave_type as enum ('annual', 'sick', 'casual', 'maternity', 'paternity', 'unpaid', 'other');
create type public.leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.appraisal_status as enum ('draft', 'submitted', 'acknowledged');
create type public.publication_type as enum (
  'journal_article', 'conference_paper', 'book', 'book_chapter', 'patent', 'other'
);

-- ----------------------------------------------------------------------------
-- employees — extends a user with HR fields (faculty, staff, etc.)
-- ----------------------------------------------------------------------------

create table public.employees (
  id uuid primary key references auth.users(id) on delete cascade,
  university_id uuid not null references public.universities(id) on delete cascade,
  employee_number text not null,
  department_id uuid references public.departments(id),
  designation text not null,
  employment_type public.employment_type not null default 'full_time',
  employment_status public.employment_status not null default 'active',
  joining_date date not null default current_date,
  reporting_to uuid references auth.users(id),
  basic_salary numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (university_id, employee_number)
);

create index idx_employees_university_id on public.employees (university_id);
create index idx_employees_department_id on public.employees (department_id);
create index idx_employees_reporting_to on public.employees (reporting_to);

alter table public.employees enable row level security;

create policy employees_select_self on public.employees
  for select using (id = auth.uid());

create policy employees_select_manager on public.employees
  for select using (reporting_to = auth.uid());

create policy employees_select_staff on public.employees
  for select using (public.has_any_role_in_university(array['admin', 'hr', 'dean', 'hod']::public.app_role[], university_id));

create policy employees_write on public.employees
  for all using (public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id));

select public.attach_standard_triggers('public.employees');

-- Tighten payroll.employee_id now that public.employees exists.
alter table public.payroll
  add constraint fk_payroll_employee foreign key (employee_id) references public.employees(id) on delete cascade;

-- ----------------------------------------------------------------------------
-- recruitment — job postings / requisitions
-- ----------------------------------------------------------------------------

create table public.recruitment (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  department_id uuid references public.departments(id),
  title text not null,
  description text,
  employment_type public.employment_type not null default 'full_time',
  positions_available integer not null default 1,
  status public.recruitment_status not null default 'open',
  posted_by uuid references auth.users(id),
  posted_at timestamptz not null default now(),
  closing_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_recruitment_university_id on public.recruitment (university_id);
create index idx_recruitment_department_id on public.recruitment (department_id);

alter table public.recruitment enable row level security;

create policy recruitment_select_open on public.recruitment
  for select using (status = 'open' or public.has_any_role_in_university(array['admin', 'hr', 'dean', 'hod']::public.app_role[], university_id));

create policy recruitment_write on public.recruitment
  for all using (public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id));

select public.attach_standard_triggers('public.recruitment');

-- ----------------------------------------------------------------------------
-- leave_requests
-- ----------------------------------------------------------------------------

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type public.leave_type not null,
  start_date date not null,
  end_date date not null,
  days_requested numeric(4, 1) not null,
  reason text,
  status public.leave_status not null default 'pending',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  check (end_date >= start_date)
);

create index idx_leave_requests_university_id on public.leave_requests (university_id);
create index idx_leave_requests_employee_id on public.leave_requests (employee_id);
create index idx_leave_requests_status on public.leave_requests (university_id, status);

alter table public.leave_requests enable row level security;

create policy leave_requests_select on public.leave_requests
  for select using (
    employee_id = auth.uid()
    or exists (select 1 from public.employees e where e.id = employee_id and e.reporting_to = auth.uid())
    or public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id)
  );

create policy leave_requests_insert on public.leave_requests
  for insert with check (employee_id = auth.uid());

create policy leave_requests_update_self on public.leave_requests
  for update using (employee_id = auth.uid() and status = 'pending')
  with check (employee_id = auth.uid() and status in ('pending', 'cancelled'));

create policy leave_requests_approve on public.leave_requests
  for update using (
    exists (select 1 from public.employees e where e.id = employee_id and e.reporting_to = auth.uid())
    or public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id)
  )
  with check (
    exists (select 1 from public.employees e where e.id = employee_id and e.reporting_to = auth.uid())
    or public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.leave_requests');

-- ----------------------------------------------------------------------------
-- appraisals
-- ----------------------------------------------------------------------------

create table public.appraisals (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  reviewer_id uuid references auth.users(id),
  review_period_start date not null,
  review_period_end date not null,
  rating numeric(3, 2),
  strengths text,
  areas_for_improvement text,
  goals text,
  status public.appraisal_status not null default 'draft',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  check (review_period_end > review_period_start)
);

create index idx_appraisals_university_id on public.appraisals (university_id);
create index idx_appraisals_employee_id on public.appraisals (employee_id);
create index idx_appraisals_reviewer_id on public.appraisals (reviewer_id);

alter table public.appraisals enable row level security;

create policy appraisals_select on public.appraisals
  for select using (
    employee_id = auth.uid()
    or reviewer_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id)
  );

create policy appraisals_write_reviewer on public.appraisals
  for all using (
    reviewer_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id)
  )
  with check (
    reviewer_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.appraisals');

-- ----------------------------------------------------------------------------
-- trainings / training_enrollments
-- ----------------------------------------------------------------------------

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  title text not null,
  description text,
  trainer text,
  start_date date,
  end_date date,
  location text,
  is_mandatory boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_trainings_university_id on public.trainings (university_id);

alter table public.trainings enable row level security;

create policy trainings_select on public.trainings
  for select using (public.is_member_of_university(university_id));

create policy trainings_write on public.trainings
  for all using (public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id));

select public.attach_standard_triggers('public.trainings');

create type public.training_enrollment_status as enum ('enrolled', 'completed', 'no_show', 'cancelled');

create table public.training_enrollments (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  training_id uuid not null references public.trainings(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  status public.training_enrollment_status not null default 'enrolled',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (training_id, employee_id)
);

create index idx_training_enrollments_university_id on public.training_enrollments (university_id);
create index idx_training_enrollments_training_id on public.training_enrollments (training_id);
create index idx_training_enrollments_employee_id on public.training_enrollments (employee_id);

alter table public.training_enrollments enable row level security;

create policy training_enrollments_select on public.training_enrollments
  for select using (
    employee_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id)
  );

create policy training_enrollments_insert_self on public.training_enrollments
  for insert with check (
    employee_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id)
  );

create policy training_enrollments_write_hr on public.training_enrollments
  for all using (public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id));

select public.attach_standard_triggers('public.training_enrollments');

-- ----------------------------------------------------------------------------
-- publications
-- ----------------------------------------------------------------------------

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null,
  abstract text,
  publication_type public.publication_type not null default 'journal_article',
  journal_name text,
  publication_date date,
  doi text,
  file_path text,
  co_authors text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_publications_university_id on public.publications (university_id);
create index idx_publications_employee_id on public.publications (employee_id);

alter table public.publications enable row level security;

create policy publications_select on public.publications
  for select using (public.is_member_of_university(university_id));

create policy publications_write_self on public.publications
  for all using (
    employee_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'hr', 'dean', 'hod']::public.app_role[], university_id)
  )
  with check (
    employee_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'hr', 'dean', 'hod']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.publications');
