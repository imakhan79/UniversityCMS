"use client"

import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Radio } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { RoleGuard } from "@/components/auth/role-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Database } from "@/types/database"

type AttendanceStatus = "present" | "absent" | "late" | "excused"
const STATUSES: AttendanceStatus[] = ["present", "absent", "late", "excused"]

function useMyOfferings(instructorId: string | undefined) {
  return useQuery({
    queryKey: ["my-offerings", instructorId],
    enabled: !!instructorId,
    queryFn: async () => {
      const supabase = createClient()
      const { data: offerings } = await supabase
        .from("course_offerings")
        .select("*")
        .eq("instructor_id", instructorId!)

      const courseIds = [...new Set((offerings ?? []).map((o) => o.course_id))]
      const { data: courses } = courseIds.length
        ? await supabase.from("courses").select("id, title, code").in("id", courseIds)
        : { data: [] }
      const courseById = new Map((courses ?? []).map((c) => [c.id, c]))

      return (offerings ?? []).map((o) => ({
        ...o,
        label: `${courseById.get(o.course_id)?.code ?? ""} — Section ${o.section_code}`,
      }))
    },
  })
}

function useRoster(offeringId: string, sessionDate: string) {
  return useQuery({
    queryKey: ["roster", offeringId, sessionDate],
    enabled: !!offeringId,
    queryFn: async () => {
      const supabase = createClient()
      const { data: registrations } = await supabase
        .from("registrations")
        .select("student_id")
        .eq("course_offering_id", offeringId)
        .eq("status", "confirmed")

      const studentIds = (registrations ?? []).map((r) => r.student_id)
      const [{ data: profiles }, { data: existing }] = await Promise.all([
        studentIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", studentIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from("attendance")
          .select("student_id, status")
          .eq("course_offering_id", offeringId)
          .eq("session_date", sessionDate),
      ])

      const existingByStudent = new Map((existing ?? []).map((e) => [e.student_id, e.status]))
      return studentIds.map((id) => ({
        studentId: id,
        name: profiles?.find((p) => p.id === id)?.full_name ?? "Unknown",
        status: (existingByStudent.get(id) as AttendanceStatus) ?? "present",
      }))
    },
  })
}

export default function FacultyAttendancePage() {
  return (
    <RoleGuard allow={["faculty", "hod", "dean"]}>
      <FacultyAttendanceContent />
    </RoleGuard>
  )
}

function FacultyAttendanceContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { data: offerings } = useMyOfferings(user?.id)
  const queryClient = useQueryClient()

  const [offeringId, setOfferingId] = React.useState("")
  const [sessionDate, setSessionDate] = React.useState(new Date().toISOString().slice(0, 10))
  const { data: roster, isLoading } = useRoster(offeringId, sessionDate)
  const [statuses, setStatuses] = React.useState<Record<string, AttendanceStatus>>({})

  React.useEffect(() => {
    if (roster) {
      setStatuses(Object.fromEntries(roster.map((r) => [r.studentId, r.status])))
    }
  }, [roster])

  async function save() {
    if (!offeringId || !universityId) return
    const supabase = createClient()
    const rows: Database["public"]["Tables"]["attendance"]["Insert"][] = Object.entries(statuses).map(
      ([studentId, status]) => ({
        university_id: universityId,
        student_id: studentId,
        course_offering_id: offeringId,
        session_date: sessionDate,
        status,
        recorded_by: user?.id,
      })
    )
    const { error } = await supabase
      .from("attendance")
      .upsert(rows, { onConflict: "student_id,course_offering_id,session_date" })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Attendance saved")
    queryClient.invalidateQueries({ queryKey: ["roster", offeringId, sessionDate] })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Course offering</label>
            <Select value={offeringId} onValueChange={(v) => setOfferingId(v ?? "")}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select offering" />
              </SelectTrigger>
              <SelectContent>
                {(offerings ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Session date</label>
            <Input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button variant="outline" disabled className="gap-1.5">
            <Radio className="size-4" /> Sync from biometric device
          </Button>
        </CardContent>
      </Card>

      {offeringId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Roster</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (roster ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No confirmed students in this section.</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roster!.map((r) => (
                      <TableRow key={r.studentId}>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>
                          <Select
                            value={statuses[r.studentId] ?? "present"}
                            onValueChange={(v) =>
                              setStatuses((s) => ({ ...s, [r.studentId]: v as AttendanceStatus }))
                            }
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button className="mt-4" onClick={save}>
                  Save attendance
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
