-- ============================================================================
-- MIGRATION 005 — Examinations
-- Zicon UMS
--
-- Creates: exams, exam_schedules, question_bank, exam_attempts,
-- exam_answers, results, grade_appeals.
-- ============================================================================

create type public.exam_type as enum ('quiz', 'midterm', 'final', 'assignment_exam', 'makeup');
create type public.question_type as enum ('mcq', 'true_false', 'short_answer', 'essay', 'numeric');
create type public.difficulty_level as enum ('easy', 'medium', 'hard');
create type public.exam_attempt_status as enum ('in_progress', 'submitted', 'graded', 'expired');
create type public.result_status as enum ('pass', 'fail', 'absent', 'pending');
create type public.appeal_status as enum ('submitted', 'under_review', 'approved', 'rejected');

-- ----------------------------------------------------------------------------
-- exams
-- ----------------------------------------------------------------------------

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  name text not null,
  exam_type public.exam_type not null default 'quiz',
  total_marks numeric(6, 2) not null default 100,
  passing_marks numeric(6, 2),
  duration_minutes integer not null default 60,
  is_online boolean not null default false,
  weight_percent numeric(5, 2),
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_exams_university_id on public.exams (university_id);
create index idx_exams_course_offering_id on public.exams (course_offering_id);

alter table public.exams enable row level security;

create policy exams_select on public.exams
  for select using (
    public.teaches_offering(course_offering_id)
    or exists (
      select 1 from public.registrations r
      where r.course_offering_id = exams.course_offering_id and r.student_id = auth.uid()
    )
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy exams_write_instructor on public.exams
  for all using (
    public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  )
  with check (
    public.teaches_offering(course_offering_id)
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.exams');

-- ----------------------------------------------------------------------------
-- exam_schedules
-- ----------------------------------------------------------------------------

create table public.exam_schedules (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  campus_id uuid references public.campuses(id),
  scheduled_date date not null,
  start_time time not null,
  end_time time not null,
  room text,
  is_makeup boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  check (end_time > start_time)
);

create index idx_exam_schedules_university_id on public.exam_schedules (university_id);
create index idx_exam_schedules_exam_id on public.exam_schedules (exam_id);
create index idx_exam_schedules_scheduled_date on public.exam_schedules (scheduled_date);

alter table public.exam_schedules enable row level security;

create policy exam_schedules_select on public.exam_schedules
  for select using (
    exists (
      select 1 from public.exams e
      where e.id = exam_id and (
        public.teaches_offering(e.course_offering_id)
        or exists (
          select 1 from public.registrations r
          where r.course_offering_id = e.course_offering_id and r.student_id = auth.uid()
        )
      )
    )
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy exam_schedules_write on public.exam_schedules
  for all using (
    exists (select 1 from public.exams e where e.id = exam_id and public.teaches_offering(e.course_offering_id))
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  )
  with check (
    exists (select 1 from public.exams e where e.id = exam_id and public.teaches_offering(e.course_offering_id))
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.exam_schedules');

-- ----------------------------------------------------------------------------
-- question_bank
-- ----------------------------------------------------------------------------

create table public.question_bank (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  question_text text not null,
  question_type public.question_type not null default 'mcq',
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb,
  marks numeric(6, 2) not null default 1,
  difficulty public.difficulty_level not null default 'medium',
  tags text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_question_bank_university_id on public.question_bank (university_id);
create index idx_question_bank_course_id on public.question_bank (course_id);
create index idx_question_bank_tags on public.question_bank using gin (tags);

alter table public.question_bank enable row level security;

create policy question_bank_select on public.question_bank
  for select using (public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod', 'faculty']::public.app_role[], university_id));

create policy question_bank_write on public.question_bank
  for all using (public.has_any_role_in_university(array['admin', 'hod', 'faculty']::public.app_role[], university_id) and created_by = auth.uid())
  with check (public.has_any_role_in_university(array['admin', 'hod', 'faculty']::public.app_role[], university_id));

create policy question_bank_write_admin on public.question_bank
  for all using (public.is_university_admin(university_id))
  with check (public.is_university_admin(university_id));

select public.attach_standard_triggers('public.question_bank');

-- ----------------------------------------------------------------------------
-- exam_attempts
-- ----------------------------------------------------------------------------

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status public.exam_attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  total_score numeric(6, 2),
  ip_address inet,
  proctoring_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (exam_id, student_id)
);

create index idx_exam_attempts_university_id on public.exam_attempts (university_id);
create index idx_exam_attempts_exam_id on public.exam_attempts (exam_id);
create index idx_exam_attempts_student_id on public.exam_attempts (student_id);

alter table public.exam_attempts enable row level security;

create policy exam_attempts_select on public.exam_attempts
  for select using (
    student_id = auth.uid()
    or exists (select 1 from public.exams e where e.id = exam_id and public.teaches_offering(e.course_offering_id))
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy exam_attempts_insert on public.exam_attempts
  for insert with check (student_id = auth.uid());

create policy exam_attempts_update_self on public.exam_attempts
  for update using (student_id = auth.uid() and status = 'in_progress')
  with check (student_id = auth.uid() and status in ('in_progress', 'submitted'));

create policy exam_attempts_write_instructor on public.exam_attempts
  for all using (
    exists (select 1 from public.exams e where e.id = exam_id and public.teaches_offering(e.course_offering_id))
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  )
  with check (
    exists (select 1 from public.exams e where e.id = exam_id and public.teaches_offering(e.course_offering_id))
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.exam_attempts');

-- ----------------------------------------------------------------------------
-- exam_answers
-- ----------------------------------------------------------------------------

create table public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  exam_attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_id uuid not null references public.question_bank(id),
  answer jsonb,
  marks_awarded numeric(6, 2),
  is_correct boolean,
  graded_by uuid references auth.users(id),
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (exam_attempt_id, question_id)
);

create index idx_exam_answers_university_id on public.exam_answers (university_id);
create index idx_exam_answers_exam_attempt_id on public.exam_answers (exam_attempt_id);
create index idx_exam_answers_question_id on public.exam_answers (question_id);

alter table public.exam_answers enable row level security;

create policy exam_answers_select on public.exam_answers
  for select using (
    exists (select 1 from public.exam_attempts ea where ea.id = exam_attempt_id and ea.student_id = auth.uid())
    or exists (
      select 1 from public.exam_attempts ea
      join public.exams e on e.id = ea.exam_id
      where ea.id = exam_attempt_id and public.teaches_offering(e.course_offering_id)
    )
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy exam_answers_write_self on public.exam_answers
  for insert with check (
    exists (
      select 1 from public.exam_attempts ea
      where ea.id = exam_attempt_id and ea.student_id = auth.uid() and ea.status = 'in_progress'
    )
  );

create policy exam_answers_update_self on public.exam_answers
  for update using (
    exists (
      select 1 from public.exam_attempts ea
      where ea.id = exam_attempt_id and ea.student_id = auth.uid() and ea.status = 'in_progress'
    )
  )
  with check (
    exists (
      select 1 from public.exam_attempts ea
      where ea.id = exam_attempt_id and ea.student_id = auth.uid() and ea.status = 'in_progress'
    )
  );

create policy exam_answers_grade_instructor on public.exam_answers
  for update using (
    exists (
      select 1 from public.exam_attempts ea
      join public.exams e on e.id = ea.exam_id
      where ea.id = exam_attempt_id and public.teaches_offering(e.course_offering_id)
    )
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  )
  with check (
    exists (
      select 1 from public.exam_attempts ea
      join public.exams e on e.id = ea.exam_id
      where ea.id = exam_attempt_id and public.teaches_offering(e.course_offering_id)
    )
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.exam_answers');

-- ----------------------------------------------------------------------------
-- results
-- ----------------------------------------------------------------------------

create table public.results (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  marks_obtained numeric(6, 2),
  grade_letter text,
  status public.result_status not null default 'pending',
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (exam_id, student_id)
);

create index idx_results_university_id on public.results (university_id);
create index idx_results_exam_id on public.results (exam_id);
create index idx_results_student_id on public.results (student_id);

alter table public.results enable row level security;

create policy results_select_student on public.results
  for select using (
    (student_id = auth.uid() and published = true)
    or public.is_guardian_of(student_id)
    or exists (select 1 from public.exams e where e.id = exam_id and public.teaches_offering(e.course_offering_id))
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy results_write_instructor on public.results
  for all using (
    exists (select 1 from public.exams e where e.id = exam_id and public.teaches_offering(e.course_offering_id))
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  )
  with check (
    exists (select 1 from public.exams e where e.id = exam_id and public.teaches_offering(e.course_offering_id))
    or public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.results');

-- ----------------------------------------------------------------------------
-- grade_appeals
-- ----------------------------------------------------------------------------

create table public.grade_appeals (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  result_id uuid not null references public.results(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  reason text not null,
  status public.appeal_status not null default 'submitted',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_grade_appeals_university_id on public.grade_appeals (university_id);
create index idx_grade_appeals_result_id on public.grade_appeals (result_id);
create index idx_grade_appeals_student_id on public.grade_appeals (student_id);

alter table public.grade_appeals enable row level security;

create policy grade_appeals_select on public.grade_appeals
  for select using (
    student_id = auth.uid()
    or exists (
      select 1 from public.results r
      join public.exams e on e.id = r.exam_id
      where r.id = result_id and public.teaches_offering(e.course_offering_id)
    )
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy grade_appeals_insert on public.grade_appeals
  for insert with check (student_id = auth.uid());

create policy grade_appeals_update_reviewer on public.grade_appeals
  for update using (
    exists (
      select 1 from public.results r
      join public.exams e on e.id = r.exam_id
      where r.id = result_id and public.teaches_offering(e.course_offering_id)
    )
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  )
  with check (
    exists (
      select 1 from public.results r
      join public.exams e on e.id = r.exam_id
      where r.id = result_id and public.teaches_offering(e.course_offering_id)
    )
    or public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.grade_appeals');
