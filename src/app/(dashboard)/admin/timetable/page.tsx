"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { useCrud } from "@/hooks/use-crud"
import { RoleGuard } from "@/components/auth/role-guard"
import { WeeklyTimetable, type TimetableEntry } from "@/components/academics/weekly-timetable"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function useMasterTimetable(semesterId: string | undefined) {
  return useQuery({
    queryKey: ["master-timetable", semesterId],
    enabled: !!semesterId,
    queryFn: async (): Promise<TimetableEntry[]> => {
      const supabase = createClient()
      const { data: offerings } = await supabase
        .from("course_offerings")
        .select("*")
        .eq("semester_id", semesterId!)

      const courseIds = [...new Set((offerings ?? []).map((o) => o.course_id))]
      const { data: courses } = courseIds.length
        ? await supabase.from("courses").select("id, title, code").in("id", courseIds)
        : { data: [] }
      const courseById = new Map((courses ?? []).map((c) => [c.id, c]))

      return (offerings ?? []).flatMap((o) =>
        o.schedule.map((s) => ({
          day: s.day,
          start: s.start,
          end: s.end,
          title: `${courseById.get(o.course_id)?.code ?? ""} (${o.section_code})`,
          subtitle: o.room ?? undefined,
        }))
      )
    },
  })
}

export default function AdminTimetablePage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "registrar"]}>
      <AdminTimetableContent />
    </RoleGuard>
  )
}

function AdminTimetableContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { list: semesters } = useCrud("semesters", universityId)

  const [semesterId, setSemesterId] = React.useState<string>("")

  React.useEffect(() => {
    if (!semesterId && semesters.data?.length) {
      setSemesterId(semesters.data.find((s) => s.is_current)?.id ?? semesters.data[0].id)
    }
  }, [semesters.data, semesterId])

  const { data: entries, isLoading } = useMasterTimetable(semesterId || undefined)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Master timetable</h1>
        <Select value={semesterId} onValueChange={(v) => setSemesterId(v ?? "")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Semester" />
          </SelectTrigger>
          <SelectContent>
            {(semesters.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? <Skeleton className="h-64 w-full" /> : <WeeklyTimetable entries={entries ?? []} />}
    </div>
  )
}
