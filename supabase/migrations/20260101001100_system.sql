-- ============================================================================
-- MIGRATION 011 — System
-- Zicon UMS
--
-- Creates: audit_logs (the destination public.audit_log_changes() has been
-- writing to via forward reference since migration 001), settings,
-- integrations, api_keys.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- audit_logs
--
-- Exception to the "every table gets the standard triggers" convention:
-- this table is itself the audit trail, so it does NOT get
-- attach_standard_triggers() — doing so would make every insert into
-- audit_logs recursively log a change about itself. Rows are written only
-- by the SECURITY DEFINER public.audit_log_changes() trigger function
-- (which runs as the table-owning role and so bypasses RLS below), never
-- directly by application code.
-- ----------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id) on delete cascade,
  table_name text not null,
  record_id uuid,
  action text not null,
  actor_id uuid references auth.users(id),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_audit_logs_university_id on public.audit_logs (university_id);
create index idx_audit_logs_table_record on public.audit_logs (table_name, record_id);
create index idx_audit_logs_actor_id on public.audit_logs (actor_id);
create index idx_audit_logs_created_at on public.audit_logs (created_at);

alter table public.audit_logs enable row level security;

create policy audit_logs_select_admin on public.audit_logs
  for select using (
    university_id is not null
    and public.has_any_role_in_university(array['admin', 'registrar']::public.app_role[], university_id)
  );

create policy audit_logs_select_super_admin on public.audit_logs
  for select using (public.is_super_admin());

-- No insert/update/delete policy for regular roles: rows are written only
-- by the trigger function running as the table owner (bypasses RLS), and
-- the log must not be editable by anyone once written.

-- ----------------------------------------------------------------------------
-- settings — university_id null = platform-wide default/override.
-- ----------------------------------------------------------------------------

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create unique index uq_settings_global_key
  on public.settings (key) where university_id is null;

create unique index uq_settings_university_key
  on public.settings (university_id, key) where university_id is not null;

create index idx_settings_university_id on public.settings (university_id);

alter table public.settings enable row level security;

create policy settings_select_public on public.settings
  for select using (is_public = true);

create policy settings_select_member on public.settings
  for select using (university_id is not null and public.is_member_of_university(university_id));

create policy settings_write_super_admin on public.settings
  for all using (university_id is null and public.is_super_admin())
  with check (university_id is null and public.is_super_admin());

create policy settings_write_university_admin on public.settings
  for all using (university_id is not null and public.is_university_admin(university_id))
  with check (university_id is not null and public.is_university_admin(university_id));

select public.attach_standard_triggers('public.settings');

-- ----------------------------------------------------------------------------
-- integrations
--
-- Secrets (client secrets, signing certs, API tokens) must NOT be stored in
-- `config` in plaintext — store them in Supabase Vault and keep only
-- non-secret configuration (issuer URLs, client IDs, feature flags) here.
-- ----------------------------------------------------------------------------

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  provider text not null,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  connected_by uuid references auth.users(id),
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (university_id, provider)
);

create index idx_integrations_university_id on public.integrations (university_id);

alter table public.integrations enable row level security;

create policy integrations_select_admin on public.integrations
  for select using (public.is_university_admin(university_id));

create policy integrations_write_admin on public.integrations
  for all using (public.is_university_admin(university_id))
  with check (public.is_university_admin(university_id));

select public.attach_standard_triggers('public.integrations');

-- ----------------------------------------------------------------------------
-- api_keys — only a hash of the key is ever stored.
-- ----------------------------------------------------------------------------

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  name text not null,
  key_hash text not null,
  key_prefix text not null,
  scopes text[] not null default '{}',
  is_active boolean not null default true,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (key_hash)
);

create index idx_api_keys_university_id on public.api_keys (university_id);
create index idx_api_keys_key_prefix on public.api_keys (key_prefix);

alter table public.api_keys enable row level security;

create policy api_keys_select_admin on public.api_keys
  for select using (public.is_university_admin(university_id));

create policy api_keys_write_admin on public.api_keys
  for all using (public.is_university_admin(university_id))
  with check (public.is_university_admin(university_id));

select public.attach_standard_triggers('public.api_keys');
