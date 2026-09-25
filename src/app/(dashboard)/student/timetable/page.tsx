"use client"

import dynamic from "next/dynamic"
import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { RoleGuard } from "@/components/auth/role-guard"
import { WeeklyTimetable, type TimetableEntry } from "@/components/academics/weekly-timetable"
import { downloadIcs, generateIcs } from "@/lib/academics/ics"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  { ssr: false, loading: () => <Skeleton className="h-9 w-40" /> }
)
const TimetableDocument = dynamic(
  () => import("@/components/pdf/timetable").then((m) => m.TimetableDocument),
  { ssr: false }
)

function useMyTimetable(studentId: string | undefined) {
  return useQuery({
    queryKey: ["my-timetable", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const supabase = createClient()
      const { data: registrations } = await supabase
        .from("registrations")
        .select("course_offering_id")
        .eq("student_id", studentId!)
        .eq("status", "confirmed")

      const offeringIds = (registrations ?? []).map((r) => r.course_offering_id)
      if (offeringIds.length === 0) return { entries: [] as TimetableEntry[], semester: null }

      const { data: offerings } = await supabase
        .from("course_offerings")
        .select("*")
        .in("id", offeringIds)

      const courseIds = [...new Set((offerings ?? []).map((o) => o.course_id))]
      const { data: courses } = courseIds.length
        ? await supabase.from("courses").select("id, title, code").in("id", courseIds)
        : { data: [] }
      const courseById = new Map((courses ?? []).map((c) => [c.id, c]))

      const semesterId = offerings?.[0]?.semester_id
      const { data: semester } = semesterId
        ? await supabase.from("semesters").select("*").eq("id", semesterId).single()
        : { data: null }

      const entries: TimetableEntry[] = (offerings ?? []).flatMap((o) =>
        o.schedule.map((s) => ({
          day: s.day,
          start: s.start,
          end: s.end,
          title: courseById.get(o.course_id)?.code ?? "",
          subtitle: courseById.get(o.course_id)?.title,
        }))
      )

      return { entries, semester }
    },
  })
}

export default function StudentTimetablePage() {
  return (
    <RoleGuard allow={["student"]}>
      <StudentTimetableContent />
    </RoleGuard>
  )
}

function StudentTimetableContent() {
  const { data: user } = useUser()
  const { data, isLoading } = useMyTimetable(user?.id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My timetable</h1>
        {data && data.entries.length > 0 && data.semester && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                downloadIcs(
                  "timetable.ics",
                  generateIcs(data.entries, data.semester!.start_date, data.semester!.end_date)
                )
              }
            >
              Export .ics
            </Button>
            <PDFDownloadLink
              document={<TimetableDocument title="My Timetable" entries={data.entries} />}
              fileName="timetable.pdf"
            >
              {({ loading }: { loading: boolean }) => (
                <Button disabled={loading}>{loading ? "Preparing..." : "Export PDF"}</Button>
              )}
            </PDFDownloadLink>
          </div>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <WeeklyTimetable entries={data?.entries ?? []} />
      )}
    </div>
  )
}
