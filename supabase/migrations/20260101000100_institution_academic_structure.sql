-- ============================================================================
-- MIGRATION 001 — Institution & Academic Structure
-- Zicon UMS
--
-- Creates: extensions, shared enums, shared trigger/RLS helper functions,
-- universities, campuses, faculties, departments, programs, semesters,
-- courses, course_prerequisites, course_offerings.
--
-- NOTE ON FORWARD REFERENCES: `public.user_roles` (migration 002) and
-- `public.audit_logs` (migration 011) do not exist yet when this file runs.
-- Postgres does not resolve table/column names inside a PL/pgSQL function
-- body until the function is first *executed* (only the function signature
-- is checked at CREATE FUNCTION / CREATE POLICY time), so it is safe to
-- define helper functions here that reference those tables, as long as no
-- code actually calls them before migration 011 has run. This lets us keep
-- one reusable set of RLS/trigger helpers instead of redefining them in
-- every migration.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Shared enums
-- ----------------------------------------------------------------------------

create type public.app_role as enum (
  'super_admin',
  'admin',
  'registrar',
  'dean',
  'hod',
  'faculty',
  'student',
  'parent',
  'alumni',
  'finance',
  'hr',
  'librarian'
);

create type public.degree_level as enum (
  'certificate',
  'diploma',
  'associate',
  'bachelor',
  'master',
  'phd',
  'postdoc'
);

create type public.offering_mode as enum ('in_person', 'online', 'hybrid');

create type public.offering_status as enum (
  'scheduled',
  'open_for_registration',
  'ongoing',
  'completed',
  'cancelled'
);

-- ----------------------------------------------------------------------------
-- Shared trigger functions (reused by every migration)
-- ----------------------------------------------------------------------------

-- Maintains created_at/created_by (insert-only) and updated_at/updated_by.
create or replace function public.set_audit_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_at := now();
    new.updated_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

-- Generic audit-log writer, attached to every business table.
-- References public.audit_logs, created in migration 011 (see note above).
create or replace function public.audit_log_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_university_id uuid;
begin
  begin
    if tg_op = 'DELETE' then
      v_university_id := (to_jsonb(old) ->> 'university_id')::uuid;
    else
      v_university_id := (to_jsonb(new) ->> 'university_id')::uuid;
    end if;
  exception when others then
    v_university_id := null;
  end;

  insert into public.audit_logs (
    university_id, table_name, record_id, action, actor_id, old_data, new_data
  )
  values (
    v_university_id,
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'))::uuid,
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Convenience: attach both standard triggers to a table in one call.
create or replace function public.attach_standard_triggers(target_table regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger trg_%s_audit_columns before insert or update on %s
       for each row execute function public.set_audit_columns();',
    replace(target_table::text, '.', '_'), target_table
  );
  execute format(
    'create trigger trg_%s_audit_log after insert or update or delete on %s
       for each row execute function public.audit_log_changes();',
    replace(target_table::text, '.', '_'), target_table
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Shared RLS helper functions
-- References public.user_roles, created in migration 002 (see note above).
-- ----------------------------------------------------------------------------

-- All role checks below require is_active = true and an unexpired
-- expires_at, so deactivating or letting a role lapse actually revokes
-- access rather than only hiding it in the UI.

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'super_admin'
      and ur.is_active = true
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

create or replace function public.has_role_in_university(check_role public.app_role, uni_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = check_role
      and ur.university_id = uni_id
      and ur.is_active = true
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

create or replace function public.has_any_role_in_university(check_roles public.app_role[], uni_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = any(check_roles)
      and ur.university_id = uni_id
      and ur.is_active = true
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

create or replace function public.is_member_of_university(uni_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.university_id = uni_id
      and ur.is_active = true
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

-- Admin-tier roles that manage the whole university (not just their own domain).
create or replace function public.is_university_admin(uni_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], uni_id);
$$;

-- ----------------------------------------------------------------------------
-- universities (tenant root — no university_id column on itself)
-- ----------------------------------------------------------------------------

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  code text not null unique,
  domain text unique,
  logo_url text,
  address text,
  city text,
  country text,
  phone text,
  email text,
  website text,
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_universities_code on public.universities (code);
create index idx_universities_is_active on public.universities (is_active);

alter table public.universities enable row level security;

create policy universities_select on public.universities
  for select using (public.is_member_of_university(id));

-- Registration needs a public "pick your university" directory before the
-- signee has any user_roles row — expose only active universities, and only
-- the row itself (application code selects specific non-sensitive columns).
create policy universities_select_public_directory on public.universities
  for select using (is_active = true);

create policy universities_insert on public.universities
  for insert with check (public.is_super_admin());

create policy universities_update on public.universities
  for update using (public.is_super_admin() or public.is_university_admin(id));

create policy universities_delete on public.universities
  for delete using (public.is_super_admin());

select public.attach_standard_triggers('public.universities');

-- ----------------------------------------------------------------------------
-- campuses
-- ----------------------------------------------------------------------------

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  name text not null,
  code text not null,
  address text,
  city text,
  country text,
  is_main boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (university_id, code)
);

create index idx_campuses_university_id on public.campuses (university_id);

alter table public.campuses enable row level security;

create policy campuses_select on public.campuses
  for select using (public.is_member_of_university(university_id));

create policy campuses_write on public.campuses
  for all using (public.is_university_admin(university_id))
  with check (public.is_university_admin(university_id));

select public.attach_standard_triggers('public.campuses');

-- ----------------------------------------------------------------------------
-- faculties
-- ----------------------------------------------------------------------------

create table public.faculties (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  name text not null,
  code text not null,
  dean_id uuid references auth.users(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (university_id, code)
);

create index idx_faculties_university_id on public.faculties (university_id);
create index idx_faculties_campus_id on public.faculties (campus_id);
create index idx_faculties_dean_id on public.faculties (dean_id);

alter table public.faculties enable row level security;

create policy faculties_select on public.faculties
  for select using (public.is_member_of_university(university_id));

create policy faculties_write_admin on public.faculties
  for all using (public.is_university_admin(university_id))
  with check (public.is_university_admin(university_id));

create policy faculties_update_dean on public.faculties
  for update using (dean_id = auth.uid() and public.has_role_in_university('dean', university_id))
  with check (dean_id = auth.uid() and public.has_role_in_university('dean', university_id));

select public.attach_standard_triggers('public.faculties');

-- ----------------------------------------------------------------------------
-- departments
-- ----------------------------------------------------------------------------

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  faculty_id uuid not null references public.faculties(id) on delete cascade,
  name text not null,
  code text not null,
  hod_id uuid references auth.users(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (university_id, code)
);

create index idx_departments_university_id on public.departments (university_id);
create index idx_departments_faculty_id on public.departments (faculty_id);
create index idx_departments_hod_id on public.departments (hod_id);

alter table public.departments enable row level security;

create policy departments_select on public.departments
  for select using (public.is_member_of_university(university_id));

create policy departments_write_admin on public.departments
  for all using (public.is_university_admin(university_id))
  with check (public.is_university_admin(university_id));

create policy departments_write_dean on public.departments
  for all using (
    public.has_role_in_university('dean', university_id)
    and faculty_id in (select id from public.faculties f where f.dean_id = auth.uid())
  )
  with check (
    public.has_role_in_university('dean', university_id)
    and faculty_id in (select id from public.faculties f where f.dean_id = auth.uid())
  );

create policy departments_update_hod on public.departments
  for update using (hod_id = auth.uid() and public.has_role_in_university('hod', university_id))
  with check (hod_id = auth.uid() and public.has_role_in_university('hod', university_id));

select public.attach_standard_triggers('public.departments');

-- ----------------------------------------------------------------------------
-- programs
-- ----------------------------------------------------------------------------

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  code text not null,
  degree_level public.degree_level not null,
  duration_years numeric(3, 1) not null,
  total_credit_hours integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (university_id, code)
);

create index idx_programs_university_id on public.programs (university_id);
create index idx_programs_department_id on public.programs (department_id);

alter table public.programs enable row level security;

create policy programs_select on public.programs
  for select using (public.is_member_of_university(university_id));

create policy programs_write_admin on public.programs
  for all using (public.is_university_admin(university_id))
  with check (public.is_university_admin(university_id));

create policy programs_write_hod on public.programs
  for all using (
    public.has_role_in_university('hod', university_id)
    and department_id in (select id from public.departments d where d.hod_id = auth.uid())
  )
  with check (
    public.has_role_in_university('hod', university_id)
    and department_id in (select id from public.departments d where d.hod_id = auth.uid())
  );

select public.attach_standard_triggers('public.programs');

-- ----------------------------------------------------------------------------
-- semesters
-- ----------------------------------------------------------------------------

create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  name text not null,
  code text not null,
  academic_year text not null,
  start_date date not null,
  end_date date not null,
  registration_start date,
  registration_end date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (university_id, code),
  check (end_date > start_date)
);

create index idx_semesters_university_id on public.semesters (university_id);
create index idx_semesters_is_current on public.semesters (university_id, is_current);

alter table public.semesters enable row level security;

create policy semesters_select on public.semesters
  for select using (public.is_member_of_university(university_id));

create policy semesters_write on public.semesters
  for all using (public.is_university_admin(university_id))
  with check (public.is_university_admin(university_id));

select public.attach_standard_triggers('public.semesters');

-- ----------------------------------------------------------------------------
-- courses (catalog entries — not tied to a semester)
-- ----------------------------------------------------------------------------

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  credit_hours integer not null check (credit_hours > 0),
  level integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (university_id, code)
);

create index idx_courses_university_id on public.courses (university_id);
create index idx_courses_department_id on public.courses (department_id);

alter table public.courses enable row level security;

create policy courses_select on public.courses
  for select using (public.is_member_of_university(university_id));

create policy courses_write_admin on public.courses
  for all using (public.is_university_admin(university_id))
  with check (public.is_university_admin(university_id));

create policy courses_write_hod on public.courses
  for all using (
    public.has_role_in_university('hod', university_id)
    and department_id in (select id from public.departments d where d.hod_id = auth.uid())
  )
  with check (
    public.has_role_in_university('hod', university_id)
    and department_id in (select id from public.departments d where d.hod_id = auth.uid())
  );

select public.attach_standard_triggers('public.courses');

-- ----------------------------------------------------------------------------
-- course_prerequisites (self-referencing many-to-many on courses)
-- ----------------------------------------------------------------------------

create table public.course_prerequisites (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  prerequisite_course_id uuid not null references public.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (course_id, prerequisite_course_id),
  check (course_id <> prerequisite_course_id)
);

create index idx_course_prereqs_course_id on public.course_prerequisites (course_id);
create index idx_course_prereqs_prereq_id on public.course_prerequisites (prerequisite_course_id);

alter table public.course_prerequisites enable row level security;

create policy course_prerequisites_select on public.course_prerequisites
  for select using (public.is_member_of_university(university_id));

create policy course_prerequisites_write on public.course_prerequisites
  for all using (public.is_university_admin(university_id) or public.has_role_in_university('hod', university_id))
  with check (public.is_university_admin(university_id) or public.has_role_in_university('hod', university_id));

-- ----------------------------------------------------------------------------
-- course_offerings (a course taught in a given semester/section)
-- ----------------------------------------------------------------------------

create table public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  section_code text not null,
  instructor_id uuid references auth.users(id),
  max_seats integer not null default 40 check (max_seats > 0),
  enrolled_count integer not null default 0,
  schedule jsonb not null default '[]'::jsonb,
  room text,
  mode public.offering_mode not null default 'in_person',
  status public.offering_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (course_id, semester_id, section_code)
);

create index idx_course_offerings_university_id on public.course_offerings (university_id);
create index idx_course_offerings_course_id on public.course_offerings (course_id);
create index idx_course_offerings_semester_id on public.course_offerings (semester_id);
create index idx_course_offerings_instructor_id on public.course_offerings (instructor_id);
create index idx_course_offerings_status on public.course_offerings (university_id, status);

alter table public.course_offerings enable row level security;

create policy course_offerings_select on public.course_offerings
  for select using (public.is_member_of_university(university_id));

create policy course_offerings_write_admin on public.course_offerings
  for all using (
    public.is_university_admin(university_id)
    or public.has_any_role_in_university(array['dean', 'hod']::public.app_role[], university_id)
  )
  with check (
    public.is_university_admin(university_id)
    or public.has_any_role_in_university(array['dean', 'hod']::public.app_role[], university_id)
  );

create policy course_offerings_update_instructor on public.course_offerings
  for update using (instructor_id = auth.uid() and public.has_role_in_university('faculty', university_id))
  with check (instructor_id = auth.uid() and public.has_role_in_university('faculty', university_id));

select public.attach_standard_triggers('public.course_offerings');
