"use client"

import * as React from "react"

import { useUser } from "@/hooks/use-user"
import type { AppRole } from "@/types/database"
import { Skeleton } from "@/components/ui/skeleton"

interface RoleGuardProps {
  allow: AppRole[]
  universityId?: string
  children: React.ReactNode
  fallback?: React.ReactNode
}

// Client-side, in-page guard: hides content the viewer's role can't see and
// renders a 403 fallback otherwise. This is a UX layer, not the security
// boundary — Postgres RLS is what actually enforces access to the data
// underneath, and middleware already blocks whole route segments.
export function RoleGuard({ allow, universityId, children, fallback }: RoleGuardProps) {
  const { data: user, isLoading } = useUser()

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />
  }

  if (!user || !user.hasAnyRole(allow, universityId)) {
    return fallback ?? <Forbidden />
  }

  return <>{children}</>
}

export function Forbidden() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
      <p className="text-4xl font-bold text-muted-foreground">403</p>
      <p className="text-lg font-medium">You don&apos;t have access to this page</p>
      <p className="text-sm text-muted-foreground">
        Contact your administrator if you believe this is a mistake.
      </p>
    </div>
  )
}
