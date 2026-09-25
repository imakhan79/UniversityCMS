"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import { AUTH_USER_QUERY_KEY } from "@/hooks/use-user"

// Mounted once near the root. Keeps the cached useUser() result in sync
// with sign-in, sign-out, and token refresh events fired by the Supabase
// client anywhere in the app.
export function AuthListener() {
  const queryClient = useQueryClient()

  React.useEffect(() => {
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: AUTH_USER_QUERY_KEY })
    })

    return () => subscription.unsubscribe()
  }, [queryClient])

  return null
}
