-- ============================================================================
-- MIGRATION 003 — Students
-- Zicon UMS
--
-- Creates: students, student_guardians (supporting table so the `parent`
-- role has something to link against — not in the original list but needed
-- for it to function), student_documents, registrations, grades,
-- transcripts, attendance.
-- ============================================================================

create type public.student_status as enum (
  'active', 'on_leave', 'suspended', 'graduated', 'withdrawn', 'dismissed', 'deferred'
);

create type public.document_type as enum (
  'transcript', 'id_card', 'photo', 'birth_certificate', 'previous_degree',
  'medical_certificate', 'other'
);

create type public.registration_status as enum (
  'pending', 'confirmed', 'dropped', 'waitlisted', 'completed'
);

create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');

-- ----------------------------------------------------------------------------
-- students — extends a user (via auth.users) with academic-record fields.
-- ----------------------------------------------------------------------------

create table public.students (
  id uuid primary key references auth.users(id) on delete cascade,
  university_id uuid not null references public.universities(id) on delete cascade,
  student_number text not null,
  program_id uuid not null references public.programs(id),
  campus_id uuid references public.campuses(id),
  advisor_id uuid references auth.users(id),
  current_semester_id uuid references public.semesters(id),
  status public.student_status not null default 'active',
  enrollment_date date not null default current_date,
  expected_graduation_date date,
  actual_graduation_date date,
  cumulative_gpa numeric(4, 3) not null default 0,
  total_credits_earned integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (university_id, student_number)
);

create index idx_students_university_id on public.students (university_id);
create index idx_students_program_id on public.students (program_id);
create index idx_students_advisor_id on public.students (advisor_id);
create index idx_students_status on public.students (university_id, status);

alter table public.students enable row level security;

create policy students_select_self on public.students
  for select using (id = auth.uid());

create policy students_select_staff on public.students
  for select using (
    public.is_university_admin(university_id)
    or public.has_any_role_in_university(array['dean', 'hod', 'faculty']::public.app_role[], university_id)
  );

create policy students_select_advisor on public.students
  for select using (advisor_id = auth.uid());

create policy students_update_self on public.students
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy students_write_admin on public.students
  for all using (public.is_university_admin(university_id))
  with check (public.is_university_admin(university_id));

select public.attach_standard_triggers('public.students');

-- ----------------------------------------------------------------------------
-- student_guardians — links a `parent` role user to their child/children.
-- ----------------------------------------------------------------------------

create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references auth.users(id) on delete cascade,
  relationship text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (student_id, guardian_id)
);

create index idx_student_guardians_student_id on public.student_guardians (student_id);
create index idx_student_guardians_guardian_id on public.student_guardians (guardian_id);

create or replace function public.is_guardian_of(target_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.student_guardians sg
    where sg.student_id = target_student and sg.guardian_id = auth.uid()
  );
$$;

alter table public.student_guardians enable row level security;

create policy student_guardians_select on public.student_guardians
  for select using (
    guardian_id = auth.uid()
    or student_id = auth.uid()
    or public.is_university_admin(university_id)
  );

create policy student_guardians_write on public.student_guardians
  for all using (public.is_university_admin(university_id))
  with check (public.is_university_admin(university_id));

-- ----------------------------------------------------------------------------
-- student_documents
-- ----------------------------------------------------------------------------

create table public.student_documents (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  document_type public.document_type not null,
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

create index idx_student_documents_university_id on public.student_documents (university_id);
create index idx_student_documents_student_id on public.student_documents (student_id);

alter table public.student_documents enable row level security;

create policy student_documents_select on public.student_documents
  for select using (
    student_id = auth.uid()
    or public.is_guardian_of(student_id)
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy student_documents_insert_self on public.student_documents
  for insert with check (student_id = auth.uid() or public.is_university_admin(university_id));

create policy student_documents_write_admin on public.student_documents
  for all using (public.is_university_admin(university_id))
  with check (public.is_university_admin(university_id));

select public.attach_standard_triggers('public.student_documents');

-- ----------------------------------------------------------------------------
-- registrations — a student's enrollment in a course_offering.
-- ----------------------------------------------------------------------------

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  semester_id uuid not null references public.semesters(id),
  status public.registration_status not null default 'pending',
  registered_at timestamptz not null default now(),
  dropped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (student_id, course_offering_id)
);

create index idx_registrations_university_id on public.registrations (university_id);
create index idx_registrations_student_id on public.registrations (student_id);
create index idx_registrations_course_offering_id on public.registrations (course_offering_id);
create index idx_registrations_semester_id on public.registrations (semester_id);

create or replace function public.teaches_offering(target_offering uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.course_offerings co
    where co.id = target_offering and co.instructor_id = auth.uid()
  );
$$;

alter table public.registrations enable row level security;

create policy registrations_select on public.registrations
  for select using (
    student_id = auth.uid()
    or public.is_guardian_of(student_id)
    or public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy registrations_insert on public.registrations
  for insert with check (
    student_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy registrations_update on public.registrations
  for update using (
    (student_id = auth.uid() and status in ('pending', 'confirmed'))
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  )
  with check (
    (student_id = auth.uid() and status in ('pending', 'confirmed', 'dropped'))
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy registrations_delete_admin on public.registrations
  for delete using (public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id));

select public.attach_standard_triggers('public.registrations');

-- ----------------------------------------------------------------------------
-- grades — final course grade for a student's registration.
-- ----------------------------------------------------------------------------

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  marks_obtained numeric(6, 2),
  letter_grade text,
  grade_points numeric(4, 3),
  is_final boolean not null default false,
  graded_by uuid references auth.users(id),
  graded_at timestamptz,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (registration_id)
);

create index idx_grades_university_id on public.grades (university_id);
create index idx_grades_student_id on public.grades (student_id);
create index idx_grades_course_offering_id on public.grades (course_offering_id);

alter table public.grades enable row level security;

create policy grades_select on public.grades
  for select using (
    student_id = auth.uid()
    or public.is_guardian_of(student_id)
    or public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy grades_write_instructor on public.grades
  for all using (
    public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  )
  with check (
    public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.grades');

-- ----------------------------------------------------------------------------
-- transcripts — generated official/unofficial transcript documents.
-- ----------------------------------------------------------------------------

create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  semester_id uuid references public.semesters(id),
  file_path text,
  gpa_snapshot numeric(4, 3),
  credits_snapshot integer,
  is_official boolean not null default false,
  generated_by uuid references auth.users(id),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_transcripts_university_id on public.transcripts (university_id);
create index idx_transcripts_student_id on public.transcripts (student_id);

alter table public.transcripts enable row level security;

create policy transcripts_select on public.transcripts
  for select using (
    student_id = auth.uid()
    or public.is_guardian_of(student_id)
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy transcripts_write on public.transcripts
  for all using (
    student_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  )
  with check (
    student_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

-- ----------------------------------------------------------------------------
-- attendance
-- ----------------------------------------------------------------------------

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  session_date date not null,
  status public.attendance_status not null default 'present',
  recorded_by uuid references auth.users(id),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (student_id, course_offering_id, session_date)
);

create index idx_attendance_university_id on public.attendance (university_id);
create index idx_attendance_student_id on public.attendance (student_id);
create index idx_attendance_course_offering_id on public.attendance (course_offering_id);
create index idx_attendance_session_date on public.attendance (session_date);

alter table public.attendance enable row level security;

create policy attendance_select on public.attendance
  for select using (
    student_id = auth.uid()
    or public.is_guardian_of(student_id)
    or public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy attendance_write_instructor on public.attendance
  for all using (
    public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  )
  with check (
    public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.attendance');
