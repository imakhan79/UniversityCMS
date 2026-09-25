"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { GraduationCap } from "lucide-react"

import { cn } from "@/lib/utils"
import { NAV_SECTIONS } from "@/lib/nav-config"
import { useUser } from "@/hooks/use-user"

export function Sidebar() {
  const pathname = usePathname()
  const { data: user } = useUser()
  const roleNames = user?.roleNames ?? []

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <GraduationCap className="size-5 text-primary" />
        <span className="font-semibold tracking-tight">Zicon UMS</span>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) =>
            item.roles.some((r) => roleNames.includes(r))
          )
          if (visibleItems.length === 0) return null

          return (
            <div key={section.title}>
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
