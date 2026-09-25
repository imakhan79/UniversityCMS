"use client"

import { createClient } from "@/lib/supabase/client"

// Path convention the `documents` bucket's RLS policies (migration 012)
// depend on — do not change without updating them.
export function documentPath(universityId: string, userId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  return `${universityId}/${userId}/${Date.now()}-${safeName}`
}

export async function uploadDocument(universityId: string, userId: string, file: File) {
  const supabase = createClient()
  const path = documentPath(universityId, userId, file)
  const { error } = await supabase.storage.from("documents").upload(path, file)
  if (error) throw error
  return path
}

export async function getDocumentSignedUrl(path: string, expiresInSeconds = 3600) {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}
