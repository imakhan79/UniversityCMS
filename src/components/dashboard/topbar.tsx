"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, LogOut, Search, Settings, User as UserIcon } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DashboardBreadcrumbs } from "@/components/dashboard/breadcrumbs"

function initials(name: string | null | undefined) {
  if (!name) return "?"
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function Topbar() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: user } = useUser()

  const { data: notifications } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(10)
      if (error) throw error
      return data
    },
  })

  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    queryClient.clear()
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-card px-4">
      <div className="hidden md:block">
        <DashboardBreadcrumbs />
      </div>

      <div className="relative ml-auto flex max-w-sm flex-1 items-center md:ml-0">
        <Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Search..." className="pl-8" />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="relative rounded-lg p-1.5 hover:bg-muted">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-1 -top-1 size-4 justify-center rounded-full p-0 text-[10px]">
              {unreadCount}
            </Badge>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {!notifications || notifications.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            notifications.map((n) => (
              <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5">
                <span className={n.is_read ? "font-normal" : "font-medium"}>{n.title}</span>
                {n.body && (
                  <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted">
          <Avatar className="size-7">
            <AvatarFallback>{initials(user?.profile?.full_name)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="font-medium">{user?.profile?.full_name ?? "Loading..."}</span>
            <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <UserIcon /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
