"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { AppRole, Database } from "@/types/database"

export const AUTH_USER_QUERY_KEY = ["auth-user"] as const

type Profile = Database["public"]["Tables"]["profiles"]["Row"]
type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"]

export interface CurrentUser {
  id: string
  email: string | null
  profile: Profile | null
  roles: UserRoleRow[]
  roleNames: AppRole[]
  isSuperAdmin: boolean
  hasRole: (role: AppRole, universityId?: string) => boolean
  hasAnyRole: (roles: AppRole[], universityId?: string) => boolean
}

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("user_roles")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true),
  ])

  const activeRoles = (roles ?? []).filter(
    (r) => !r.expires_at || new Date(r.expires_at).getTime() > Date.now()
  )
  const roleNames = activeRoles.map((r) => r.role)

  return {
    id: user.id,
    email: user.email ?? null,
    profile: profile ?? null,
    roles: activeRoles,
    roleNames,
    isSuperAdmin: roleNames.includes("super_admin"),
    hasRole: (role, universityId) =>
      roleNames.includes("super_admin") ||
      activeRoles.some(
        (r) =>
          r.role === role &&
          (!universityId || r.university_id === universityId)
      ),
    hasAnyRole: (rolesToCheck, universityId) =>
      roleNames.includes("super_admin") ||
      activeRoles.some(
        (r) =>
          rolesToCheck.includes(r.role) &&
          (!universityId || r.university_id === universityId)
      ),
  }
}

export function useUser() {
  return useQuery({
    queryKey: AUTH_USER_QUERY_KEY,
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
  })
}
