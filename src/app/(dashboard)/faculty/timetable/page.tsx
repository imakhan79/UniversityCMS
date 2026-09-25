"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { RoleGuard } from "@/components/auth/role-guard"
import { WeeklyTimetable, type TimetableEntry } from "@/components/academics/weekly-timetable"
import { Skeleton } from "@/components/ui/skeleton"

function useMyTeachingSchedule(instructorId: string | undefined) {
  return useQuery({
    queryKey: ["my-teaching-schedule", instructorId],
    enabled: !!instructorId,
    queryFn: async (): Promise<TimetableEntry[]> => {
      const supabase = createClient()
      const { data: offerings } = await supabase
        .from("course_offerings")
        .select("*")
        .eq("instructor_id", instructorId!)
        .in("status", ["scheduled", "open_for_registration", "ongoing"])

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
          subtitle: `${courseById.get(o.course_id)?.title ?? ""}${o.room ? ` · ${o.room}` : ""}`,
        }))
      )
    },
  })
}

export default function FacultyTimetablePage() {
  return (
    <RoleGuard allow={["faculty", "hod", "dean"]}>
      <FacultyTimetableContent />
    </RoleGuard>
  )
}

function FacultyTimetableContent() {
  const { data: user } = useUser()
  const { data: entries, isLoading } = useMyTeachingSchedule(user?.id)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">My teaching schedule</h1>
      {isLoading ? <Skeleton className="h-64 w-full" /> : <WeeklyTimetable entries={entries ?? []} />}
    </div>
  )
}
