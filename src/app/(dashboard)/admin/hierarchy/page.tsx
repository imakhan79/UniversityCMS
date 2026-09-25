"use client"

import * as React from "react"
import { ChevronRight, Building2, Landmark, Layers, GraduationCap } from "lucide-react"

import { useUser } from "@/hooks/use-user"
import { useCrud } from "@/hooks/use-crud"
import { RoleGuard } from "@/components/auth/role-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function TreeNode({
  icon: Icon,
  label,
  sublabel,
  depth,
  children,
  defaultOpen = true,
}: {
  icon: React.ElementType
  label: string
  sublabel?: string
  depth: number
  children?: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const hasChildren = React.Children.count(children) > 0

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted"
      >
        {hasChildren ? (
          <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
        ) : (
          <span className="w-3.5" />
        )}
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">{label}</span>
        {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
      </button>
      {open && children}
    </div>
  )
}

export default function HierarchyPage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "registrar"]}>
      <HierarchyContent />
    </RoleGuard>
  )
}

function HierarchyContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null

  const { list: campuses } = useCrud("campuses", universityId)
  const { list: faculties } = useCrud("faculties", universityId)
  const { list: departments } = useCrud("departments", universityId)
  const { list: programs } = useCrud("programs", universityId)

  const isLoading =
    campuses.isLoading || faculties.isLoading || departments.isLoading || programs.isLoading

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Institution hierarchy</h1>
        <p className="text-sm text-muted-foreground">
          University → Campus → Faculty → Department → Program
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{user?.profile?.full_name ? "Your university" : "University"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : (campuses.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No campuses yet — start with the setup wizard.
            </p>
          ) : (
            (campuses.data ?? []).map((campus) => (
              <TreeNode key={campus.id} icon={Building2} label={campus.name} sublabel={campus.code} depth={0}>
                {(faculties.data ?? [])
                  .filter((f) => f.campus_id === campus.id)
                  .map((faculty) => (
                    <TreeNode key={faculty.id} icon={Landmark} label={faculty.name} sublabel={faculty.code} depth={1}>
                      {(departments.data ?? [])
                        .filter((d) => d.faculty_id === faculty.id)
                        .map((dept) => (
                          <TreeNode key={dept.id} icon={Layers} label={dept.name} sublabel={dept.code} depth={2}>
                            {(programs.data ?? [])
                              .filter((p) => p.department_id === dept.id)
                              .map((program) => (
                                <TreeNode
                                  key={program.id}
                                  icon={GraduationCap}
                                  label={program.name}
                                  sublabel={program.degree_level}
                                  depth={3}
                                />
                              ))}
                          </TreeNode>
                        ))}
                    </TreeNode>
                  ))}
              </TreeNode>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
