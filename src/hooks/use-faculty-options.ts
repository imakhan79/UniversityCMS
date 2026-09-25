"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"

export function useFacultyOptions(universityId: string | null) {
  return useQuery({
    queryKey: ["faculty-options", universityId],
    enabled: !!universityId,
    queryFn: async () => {
      const supabase = createClient()
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("university_id", universityId!)
        .eq("role", "faculty")
        .eq("is_active", true)
      if (error) throw error

      const ids = [...new Set(roles.map((r) => r.user_id))]
      if (ids.length === 0) return []

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids)

      return (profiles ?? []).map((p) => ({ value: p.id, label: p.full_name }))
    },
  })
}
