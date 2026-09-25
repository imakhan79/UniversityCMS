-- ============================================================================
-- MIGRATION 009 — LMS & Research
-- Zicon UMS
--
-- Creates: lms_courses, assignments, submissions, quizzes,
-- research_projects, research_project_members (supporting table, needed to
-- track a project's team beyond its single principal investigator), grants,
-- theses.
--
-- Note: quizzes here are lightweight, course-embedded definitions (content
-- lives in a `questions` jsonb column). Formal proctored assessment with
-- attempt/answer tracking is already covered by exams/exam_attempts/
-- exam_answers from migration 005 — reuse that path for graded quizzes
-- that need attempt history.
-- ============================================================================

create type public.submission_status as enum ('submitted', 'graded', 'resubmit_requested', 'late');
create type public.research_project_status as enum ('proposed', 'ongoing', 'completed', 'suspended');
create type public.grant_status as enum ('applied', 'awarded', 'rejected', 'completed');
create type public.thesis_status as enum (
  'proposed', 'in_progress', 'submitted', 'under_review', 'approved', 'rejected'
);

-- ----------------------------------------------------------------------------
-- lms_courses — LMS content shell for a course_offering.
-- ----------------------------------------------------------------------------

create table public.lms_courses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  description text,
  syllabus_path text,
  welcome_message text,
  materials jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (course_offering_id)
);

create index idx_lms_courses_university_id on public.lms_courses (university_id);
create index idx_lms_courses_course_offering_id on public.lms_courses (course_offering_id);

alter table public.lms_courses enable row level security;

create policy lms_courses_select on public.lms_courses
  for select using (
    public.teaches_offering(course_offering_id)
    or exists (
      select 1 from public.registrations r
      where r.course_offering_id = lms_courses.course_offering_id and r.student_id = auth.uid()
    )
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy lms_courses_write on public.lms_courses
  for all using (
    public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'hod']::public.app_role[], university_id)
  )
  with check (
    public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'hod']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.lms_courses');

-- ----------------------------------------------------------------------------
-- assignments
-- ----------------------------------------------------------------------------

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  title text not null,
  description text,
  instructions text,
  max_marks numeric(6, 2) not null default 100,
  due_date timestamptz,
  allow_late_submission boolean not null default false,
  attachment_path text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_assignments_university_id on public.assignments (university_id);
create index idx_assignments_course_offering_id on public.assignments (course_offering_id);

alter table public.assignments enable row level security;

create policy assignments_select on public.assignments
  for select using (
    public.teaches_offering(course_offering_id)
    or exists (
      select 1 from public.registrations r
      where r.course_offering_id = assignments.course_offering_id and r.student_id = auth.uid()
    )
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy assignments_write on public.assignments
  for all using (
    public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'hod']::public.app_role[], university_id)
  )
  with check (
    public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'hod']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.assignments');

-- ----------------------------------------------------------------------------
-- submissions
-- ----------------------------------------------------------------------------

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  file_path text,
  submission_text text,
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  status public.submission_status not null default 'submitted',
  marks_obtained numeric(6, 2),
  feedback text,
  graded_by uuid references auth.users(id),
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (assignment_id, student_id)
);

create index idx_submissions_university_id on public.submissions (university_id);
create index idx_submissions_assignment_id on public.submissions (assignment_id);
create index idx_submissions_student_id on public.submissions (student_id);

alter table public.submissions enable row level security;

create policy submissions_select on public.submissions
  for select using (
    student_id = auth.uid()
    or exists (
      select 1 from public.assignments a
      where a.id = assignment_id and public.teaches_offering(a.course_offering_id)
    )
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy submissions_insert_self on public.submissions
  for insert with check (student_id = auth.uid());

create policy submissions_update_self on public.submissions
  for update using (student_id = auth.uid() and status in ('submitted', 'resubmit_requested'))
  with check (student_id = auth.uid());

create policy submissions_grade_instructor on public.submissions
  for update using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id and public.teaches_offering(a.course_offering_id)
    )
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  )
  with check (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id and public.teaches_offering(a.course_offering_id)
    )
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.submissions');

-- ----------------------------------------------------------------------------
-- quizzes — lightweight, course-embedded (see header note).
-- ----------------------------------------------------------------------------

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  title text not null,
  description text,
  questions jsonb not null default '[]'::jsonb,
  time_limit_minutes integer,
  max_attempts integer not null default 1,
  due_date timestamptz,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_quizzes_university_id on public.quizzes (university_id);
create index idx_quizzes_course_offering_id on public.quizzes (course_offering_id);

alter table public.quizzes enable row level security;

create policy quizzes_select on public.quizzes
  for select using (
    public.teaches_offering(course_offering_id)
    or exists (
      select 1 from public.registrations r
      where r.course_offering_id = quizzes.course_offering_id and r.student_id = auth.uid()
    )
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy quizzes_write on public.quizzes
  for all using (
    public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'hod']::public.app_role[], university_id)
  )
  with check (
    public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'hod']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.quizzes');

-- ----------------------------------------------------------------------------
-- research_projects / research_project_members
-- ----------------------------------------------------------------------------

create table public.research_projects (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  department_id uuid references public.departments(id),
  principal_investigator_id uuid not null references public.employees(id),
  title text not null,
  description text,
  status public.research_project_status not null default 'proposed',
  start_date date,
  end_date date,
  budget numeric(14, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_research_projects_university_id on public.research_projects (university_id);
create index idx_research_projects_pi_id on public.research_projects (principal_investigator_id);

alter table public.research_projects enable row level security;

create policy research_projects_select on public.research_projects
  for select using (public.is_member_of_university(university_id));

create policy research_projects_write on public.research_projects
  for all using (
    principal_investigator_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'dean', 'hod']::public.app_role[], university_id)
  )
  with check (
    principal_investigator_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'dean', 'hod']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.research_projects');

create table public.research_project_members (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  research_project_id uuid not null references public.research_projects(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  role text default 'researcher',
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (research_project_id, member_id)
);

create index idx_research_project_members_project_id on public.research_project_members (research_project_id);

alter table public.research_project_members enable row level security;

create policy research_project_members_select on public.research_project_members
  for select using (public.is_member_of_university(university_id));

create policy research_project_members_write on public.research_project_members
  for all using (
    exists (
      select 1 from public.research_projects rp
      where rp.id = research_project_id and rp.principal_investigator_id = auth.uid()
    )
    or public.has_any_role_in_university(array['admin', 'dean', 'hod']::public.app_role[], university_id)
  )
  with check (
    exists (
      select 1 from public.research_projects rp
      where rp.id = research_project_id and rp.principal_investigator_id = auth.uid()
    )
    or public.has_any_role_in_university(array['admin', 'dean', 'hod']::public.app_role[], university_id)
  );

-- ----------------------------------------------------------------------------
-- grants
-- ----------------------------------------------------------------------------

create table public.grants (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  research_project_id uuid references public.research_projects(id) on delete set null,
  title text not null,
  funding_agency text,
  amount numeric(14, 2),
  currency text not null default 'USD',
  status public.grant_status not null default 'applied',
  grant_number text,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_grants_university_id on public.grants (university_id);
create index idx_grants_research_project_id on public.grants (research_project_id);

alter table public.grants enable row level security;

create policy grants_select on public.grants
  for select using (
    public.has_any_role_in_university(array['admin', 'finance', 'dean', 'hod']::public.app_role[], university_id)
    or exists (
      select 1 from public.research_projects rp
      where rp.id = research_project_id and rp.principal_investigator_id = auth.uid()
    )
  );

create policy grants_write on public.grants
  for all using (public.has_any_role_in_university(array['admin', 'finance', 'dean']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'finance', 'dean']::public.app_role[], university_id));

select public.attach_standard_triggers('public.grants');

-- ----------------------------------------------------------------------------
-- theses
-- ----------------------------------------------------------------------------

create table public.theses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  supervisor_id uuid references auth.users(id),
  title text not null,
  abstract text,
  degree_level public.degree_level,
  status public.thesis_status not null default 'proposed',
  submission_date date,
  defense_date date,
  file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_theses_university_id on public.theses (university_id);
create index idx_theses_student_id on public.theses (student_id);
create index idx_theses_supervisor_id on public.theses (supervisor_id);

alter table public.theses enable row level security;

create policy theses_select on public.theses
  for select using (
    student_id = auth.uid()
    or supervisor_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy theses_write_owner on public.theses
  for all using (
    student_id = auth.uid()
    or supervisor_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  )
  with check (
    student_id = auth.uid()
    or supervisor_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.theses');
