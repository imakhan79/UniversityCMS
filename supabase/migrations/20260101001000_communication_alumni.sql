-- ============================================================================
-- MIGRATION 010 — Communication & Alumni
-- Zicon UMS
--
-- Creates: notifications, messages, announcements, alumni, donations,
-- career_postings.
-- ============================================================================

create type public.notification_type as enum (
  'info', 'warning', 'success', 'error', 'academic', 'financial', 'system'
);

-- ----------------------------------------------------------------------------
-- notifications — designed for Supabase Realtime subscriptions filtered by
-- recipient_id.
-- ----------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null default 'info',
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_notifications_university_id on public.notifications (university_id);
create index idx_notifications_recipient_id on public.notifications (recipient_id, is_read);

alter table public.notifications enable row level security;

create policy notifications_select_self on public.notifications
  for select using (recipient_id = auth.uid());

create policy notifications_update_self on public.notifications
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create policy notifications_insert on public.notifications
  for insert with check (public.is_member_of_university(university_id));

create policy notifications_write_admin on public.notifications
  for all using (public.is_university_admin(university_id))
  with check (public.is_university_admin(university_id));

select public.attach_standard_triggers('public.notifications');

alter publication supabase_realtime add table public.notifications;

-- ----------------------------------------------------------------------------
-- messages — direct messages between two university members.
-- ----------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  parent_message_id uuid references public.messages(id) on delete set null,
  subject text,
  body text not null,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  check (sender_id <> recipient_id)
);

create index idx_messages_university_id on public.messages (university_id);
create index idx_messages_sender_id on public.messages (sender_id);
create index idx_messages_recipient_id on public.messages (recipient_id, is_read);
create index idx_messages_parent_message_id on public.messages (parent_message_id);

alter table public.messages enable row level security;

create policy messages_select on public.messages
  for select using (sender_id = auth.uid() or recipient_id = auth.uid());

create policy messages_insert on public.messages
  for insert with check (sender_id = auth.uid() and public.shares_university_with(recipient_id));

create policy messages_update_recipient on public.messages
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

select public.attach_standard_triggers('public.messages');

alter publication supabase_realtime add table public.messages;

-- ----------------------------------------------------------------------------
-- announcements
-- ----------------------------------------------------------------------------

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  campus_id uuid references public.campuses(id),
  department_id uuid references public.departments(id),
  title text not null,
  body text not null,
  audience_roles public.app_role[] not null default '{}',
  is_pinned boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_announcements_university_id on public.announcements (university_id);
create index idx_announcements_published_at on public.announcements (published_at);

alter table public.announcements enable row level security;

create policy announcements_select on public.announcements
  for select using (
    public.is_member_of_university(university_id)
    and (
      cardinality(audience_roles) = 0
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.university_id = university_id
          and ur.role = any(audience_roles)
      )
    )
  );

create policy announcements_write on public.announcements
  for all using (public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar', 'dean', 'hod']::public.app_role[], university_id));

select public.attach_standard_triggers('public.announcements');

alter publication supabase_realtime add table public.announcements;

-- ----------------------------------------------------------------------------
-- alumni — extends a user once they graduate.
-- ----------------------------------------------------------------------------

create table public.alumni (
  id uuid primary key references auth.users(id) on delete cascade,
  university_id uuid not null references public.universities(id) on delete cascade,
  program_id uuid references public.programs(id),
  graduation_year integer,
  current_employer text,
  current_position text,
  industry text,
  linkedin_url text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_alumni_university_id on public.alumni (university_id);
create index idx_alumni_program_id on public.alumni (program_id);

alter table public.alumni enable row level security;

create policy alumni_select_self on public.alumni
  for select using (id = auth.uid());

create policy alumni_select_directory on public.alumni
  for select using (is_verified = true and public.is_member_of_university(university_id));

create policy alumni_update_self on public.alumni
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy alumni_write_admin on public.alumni
  for all using (public.has_any_role_in_university(array['admin', 'registrar', 'hr']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'registrar', 'hr']::public.app_role[], university_id));

select public.attach_standard_triggers('public.alumni');

-- ----------------------------------------------------------------------------
-- donations
-- ----------------------------------------------------------------------------

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  donor_id uuid references auth.users(id),
  donor_name text,
  donor_email text,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'USD',
  purpose text,
  campaign text,
  payment_method public.payment_method,
  transaction_reference text,
  is_anonymous boolean not null default false,
  receipt_path text,
  donated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_donations_university_id on public.donations (university_id);
create index idx_donations_donor_id on public.donations (donor_id);

alter table public.donations enable row level security;

create policy donations_select on public.donations
  for select using (
    donor_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id)
  );

create policy donations_insert on public.donations
  for insert with check (
    donor_id = auth.uid()
    or donor_id is null
    or public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id)
  );

create policy donations_write_admin on public.donations
  for all using (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id));

select public.attach_standard_triggers('public.donations');

-- ----------------------------------------------------------------------------
-- career_postings
-- ----------------------------------------------------------------------------

create table public.career_postings (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  posted_by uuid references auth.users(id),
  title text not null,
  company text not null,
  description text,
  location text,
  employment_type public.employment_type,
  application_url text,
  application_deadline date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_career_postings_university_id on public.career_postings (university_id);
create index idx_career_postings_is_active on public.career_postings (university_id, is_active);

alter table public.career_postings enable row level security;

create policy career_postings_select on public.career_postings
  for select using (is_active = true and public.is_member_of_university(university_id));

create policy career_postings_insert on public.career_postings
  for insert with check (
    (posted_by = auth.uid() and public.has_role_in_university('alumni', university_id))
    or public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id)
  );

create policy career_postings_write_own on public.career_postings
  for all using (
    posted_by = auth.uid()
    or public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id)
  )
  with check (
    posted_by = auth.uid()
    or public.has_any_role_in_university(array['admin', 'hr']::public.app_role[], university_id)
  );

select public.attach_standard_triggers('public.career_postings');
