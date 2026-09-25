-- ============================================================================
-- MIGRATION 002 — Users & Roles
-- Zicon UMS
--
-- Creates: profiles (extends auth.users), user_roles (many-to-many).
-- The `app_role` enum itself was created in migration 001 so that its
-- earlier RLS helper functions could type-check against it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles — 1:1 extension of auth.users.
-- Deliberately has NO university_id: a single identity (e.g. a parent with
-- children at two universities, or a super_admin) can hold roles at more
-- than one university via user_roles. primary_university_id is just a
-- convenience default for the UI.
-- ----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  primary_university_id uuid references public.universities(id) on delete set null,
  full_name text not null,
  avatar_url text,
  phone text,
  date_of_birth date,
  gender text,
  address text,
  city text,
  country text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_profiles_primary_university_id on public.profiles (primary_university_id);

alter table public.profiles enable row level security;

-- Any two users who share a university (via user_roles) can see each other's
-- basic profile — needed for class rosters, staff directories, etc.
create or replace function public.shares_university_with(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1
    from public.user_roles mine
    join public.user_roles theirs
      on theirs.university_id = mine.university_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user
  );
$$;

create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

create policy profiles_select_university_peers on public.profiles
  for select using (public.shares_university_with(id));

create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_write_admin on public.profiles
  for all using (
    public.is_super_admin()
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = profiles.id
        and public.is_university_admin(ur.university_id)
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = profiles.id
        and public.is_university_admin(ur.university_id)
    )
  );

select public.attach_standard_triggers('public.profiles');

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, 'Unnamed User'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- user_roles — many-to-many between auth.users and app_role, scoped to a
-- university (super_admin is global and carries no university_id).
-- ----------------------------------------------------------------------------

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  university_id uuid references public.universities(id) on delete cascade,
  is_active boolean not null default true,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  check ((role = 'super_admin') = (university_id is null))
);

create unique index uq_user_roles_super_admin
  on public.user_roles (user_id)
  where role = 'super_admin';

create unique index uq_user_roles_scoped
  on public.user_roles (user_id, role, university_id)
  where role <> 'super_admin';

create index idx_user_roles_user_id on public.user_roles (user_id);
create index idx_user_roles_university_id on public.user_roles (university_id);
create index idx_user_roles_role on public.user_roles (role);

alter table public.user_roles enable row level security;

-- Only super_admin may grant/revoke super_admin or admin (prevents a
-- university admin from escalating their own or a peer's privileges).
create or replace function public.can_manage_role(target_role public.app_role, uni_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      target_role not in ('super_admin', 'admin')
      and uni_id is not null
      and public.is_university_admin(uni_id)
    );
$$;

create policy user_roles_select_self on public.user_roles
  for select using (user_id = auth.uid());

create policy user_roles_select_admin on public.user_roles
  for select using (university_id is not null and public.is_member_of_university(university_id) and public.is_university_admin(university_id));

create policy user_roles_write on public.user_roles
  for all using (public.can_manage_role(role, university_id))
  with check (public.can_manage_role(role, university_id));

-- Lets a freshly-registered user grant themselves the baseline 'student'
-- role for the university they signed up under (self-service onboarding).
-- Hard-codes role = 'student' so this can never be used to self-escalate.
create policy user_roles_self_enroll on public.user_roles
  for insert with check (user_id = auth.uid() and role = 'student' and university_id is not null);

select public.attach_standard_triggers('public.user_roles');
