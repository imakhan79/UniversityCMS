-- ============================================================================
-- MIGRATION 012 — Storage
-- Zicon UMS
--
-- Creates the `documents` bucket (application/student documents, receipts,
-- payslips, etc.) and `public-assets` bucket (university logos, avatars).
-- Path convention for `documents`: {university_id}/{user_id}/{filename} —
-- RLS below relies on this exact shape via storage.foldername(name).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('documents', 'documents', false, 10485760),
  ('public-assets', 'public-assets', true, 5242880)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- documents (private)
-- ----------------------------------------------------------------------------

create policy documents_select_own on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy documents_select_university_staff on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.has_any_role_in_university(
      array['admin', 'registrar', 'dean', 'hod']::public.app_role[],
      ((storage.foldername(name))[1])::uuid
    )
  );

create policy documents_insert_own on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_member_of_university(((storage.foldername(name))[1])::uuid)
  );

create policy documents_insert_staff on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and public.has_any_role_in_university(
      array['admin', 'registrar']::public.app_role[],
      ((storage.foldername(name))[1])::uuid
    )
  );

create policy documents_delete_own_or_staff on storage.objects
  for delete using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.has_any_role_in_university(
        array['admin', 'registrar']::public.app_role[],
        ((storage.foldername(name))[1])::uuid
      )
    )
  );

-- ----------------------------------------------------------------------------
-- public-assets (public read; university admins manage their own folder)
-- ----------------------------------------------------------------------------

create policy public_assets_select_all on storage.objects
  for select using (bucket_id = 'public-assets');

create policy public_assets_write_admin on storage.objects
  for all using (
    bucket_id = 'public-assets'
    and public.is_university_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'public-assets'
    and public.is_university_admin(((storage.foldername(name))[1])::uuid)
  );
