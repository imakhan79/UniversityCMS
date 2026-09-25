"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { FileText, User } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { useCrud } from "@/hooks/use-crud"
import { RoleGuard } from "@/components/auth/role-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function useStudentProfile(studentId: string) {
  return useQuery({
    queryKey: ["student-profile", studentId],
    queryFn: async () => {
      const supabase = createClient()
      const [student, profile] = await Promise.all([
        supabase.from("students").select("*").eq("id", studentId).single(),
        supabase.from("profiles").select("*").eq("id", studentId).single(),
      ])
      if (student.error) throw student.error
      return { student: student.data, profile: profile.data }
    },
  })
}

function useAcademicRecord(studentId: string, universityId: string | null) {
  return useQuery({
    queryKey: ["student-academic-record", studentId],
    enabled: !!universityId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("grades")
        .select("*")
        .eq("student_id", studentId)
      if (error) throw error
      return data
    },
  })
}

function useAttendanceSummary(studentId: string) {
  return useQuery({
    queryKey: ["student-attendance", studentId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from("attendance").select("*").eq("student_id", studentId)
      if (error) throw error
      const present = data.filter((a) => a.status === "present").length
      const pct = data.length ? Math.round((present / data.length) * 100) : 0
      return { records: data, pct }
    },
  })
}

function useFeeStatus(studentId: string) {
  return useQuery({
    queryKey: ["student-fees", studentId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("fee_invoices")
        .select("*")
        .eq("student_id", studentId)
        .order("due_date", { ascending: false })
      if (error) throw error
      return data
    },
  })
}

function useDocuments(studentId: string) {
  return useQuery({
    queryKey: ["student-documents", studentId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("student_documents")
        .select("*")
        .eq("student_id", studentId)
      if (error) throw error
      return data
    },
  })
}

export default function StudentProfilePage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "registrar", "dean", "hod"]}>
      <StudentProfileContent />
    </RoleGuard>
  )
}

function StudentProfileContent() {
  const params = useParams<{ id: string }>()
  const studentId = params.id
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null

  const { data, isLoading } = useStudentProfile(studentId)
  const { list: programs } = useCrud("programs", universityId)
  const academicRecord = useAcademicRecord(studentId, universityId)
  const attendance = useAttendanceSummary(studentId)
  const fees = useFeeStatus(studentId)
  const documents = useDocuments(studentId)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!data?.student) {
    return <p className="text-sm text-muted-foreground">Student not found.</p>
  }

  const { student, profile } = data
  const programName = programs.data?.find((p) => p.id === student.program_id)?.name ?? "—"

  const totalDue = (fees.data ?? []).reduce((sum, f) => sum + f.amount_due, 0)
  const totalPaid = (fees.data ?? []).reduce((sum, f) => sum + f.amount_paid, 0)

  const timeline = [
    { date: student.enrollment_date, label: "Enrolled", detail: programName },
    ...(fees.data ?? []).map((f) => ({
      date: f.due_date ?? "",
      label: "Invoice issued",
      detail: `$${f.amount_due} — ${f.invoice_number}`,
    })),
  ]
    .filter((t) => t.date)
    .sort((a, b) => (a.date! < b.date! ? 1 : -1))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar className="size-14">
          <AvatarFallback className="text-lg">
            {(profile?.full_name ?? "?").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{profile?.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {student.student_number} · {programName}
          </p>
        </div>
        <Badge className="ml-auto" variant={student.status === "active" ? "default" : "secondary"}>
          {student.status}
        </Badge>
      </div>

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="academic">Academic record</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="fees">Fee status</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="pt-4">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 pt-6 text-sm">
              <div>
                <p className="text-muted-foreground">Phone</p>
                <p>{profile?.phone ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">City / Country</p>
                <p>
                  {profile?.city ?? "—"}, {profile?.country ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Enrollment date</p>
                <p>{student.enrollment_date}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Expected graduation</p>
                <p>{student.expected_graduation_date ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cumulative GPA</p>
                <p>{student.cumulative_gpa}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Credits earned</p>
                <p>{student.total_credits_earned}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="academic" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Grades</CardTitle>
            </CardHeader>
            <CardContent>
              {academicRecord.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (academicRecord.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No grades recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Marks</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Grade points</TableHead>
                      <TableHead>Final</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {academicRecord.data!.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell>{g.marks_obtained ?? "—"}</TableCell>
                        <TableCell>{g.letter_grade ?? "—"}</TableCell>
                        <TableCell>{g.grade_points ?? "—"}</TableCell>
                        <TableCell>{g.is_final ? "Yes" : "No"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Attendance rate: {attendance.data?.pct ?? 0}%
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {attendance.data?.records.length ?? 0} sessions recorded.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                ${totalPaid.toLocaleString()} paid of ${totalDue.toLocaleString()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(fees.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Amount due</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fees.data!.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell>{f.invoice_number}</TableCell>
                        <TableCell>{f.due_date}</TableCell>
                        <TableCell>${f.amount_due}</TableCell>
                        <TableCell>${f.amount_paid}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{f.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="pt-4">
          <Card>
            <CardContent className="pt-6">
              {(documents.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents uploaded.</p>
              ) : (
                <ul className="space-y-2">
                  {documents.data!.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 text-sm">
                      <FileText className="size-4 text-muted-foreground" />
                      {d.file_name}
                      <Badge variant={d.verified ? "default" : "secondary"} className="ml-auto">
                        {d.verified ? "Verified" : "Pending"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="pt-4">
          <Card>
            <CardContent className="pt-6">
              <ol className="space-y-3">
                {timeline.map((t, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <User className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{t.label}</p>
                      <p className="text-muted-foreground">
                        {t.date} — {t.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
