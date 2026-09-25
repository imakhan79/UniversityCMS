"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { GraduationCap, ClipboardCheck, Wallet, BookOpen } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { RoleGuard } from "@/components/auth/role-guard"
import { StatCard } from "@/components/dashboard/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const LOW_ATTENDANCE_THRESHOLD = 75

function useMyStudentSnapshot(studentId: string | undefined) {
  return useQuery({
    queryKey: ["my-student-snapshot", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const supabase = createClient()
      const [student, attendance, invoices, registrations] = await Promise.all([
        supabase.from("students").select("*").eq("id", studentId!).single(),
        supabase.from("attendance").select("status").eq("student_id", studentId!),
        supabase.from("fee_invoices").select("amount_due, amount_paid").eq("student_id", studentId!),
        supabase
          .from("registrations")
          .select("id")
          .eq("student_id", studentId!)
          .eq("status", "confirmed"),
      ])

      const attendanceRows = attendance.data ?? []
      const present = attendanceRows.filter((a) => a.status === "present").length
      const attendancePct = attendanceRows.length
        ? Math.round((present / attendanceRows.length) * 100)
        : 0

      const pendingFees = (invoices.data ?? []).reduce(
        (sum, i) => sum + (i.amount_due - i.amount_paid),
        0
      )

      return {
        student: student.data,
        attendancePct,
        pendingFees,
        activeCourses: registrations.data?.length ?? 0,
      }
    },
  })
}

export default function StudentDashboardPage() {
  return (
    <RoleGuard allow={["student"]}>
      <StudentDashboardContent />
    </RoleGuard>
  )
}

function StudentDashboardContent() {
  const { data: user } = useUser()
  const { data, isLoading } = useMyStudentSnapshot(user?.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {user?.profile?.full_name?.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">Here&apos;s where things stand.</p>
      </div>

      {data && data.attendancePct < LOW_ATTENDANCE_THRESHOLD && (
        <Alert variant="destructive">
          <AlertTitle>Low attendance</AlertTitle>
          <AlertDescription>
            Your attendance is {data.attendancePct}%, below the {LOW_ATTENDANCE_THRESHOLD}% requirement.
            Contact your advisor if you believe this is incorrect.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Cumulative GPA"
          value={data?.student?.cumulative_gpa}
          icon={GraduationCap}
          isLoading={isLoading}
        />
        <StatCard
          label="Attendance"
          value={data ? `${data.attendancePct}%` : undefined}
          icon={ClipboardCheck}
          isLoading={isLoading}
        />
        <StatCard
          label="Pending fees"
          value={data ? `$${data.pendingFees.toLocaleString()}` : undefined}
          icon={Wallet}
          isLoading={isLoading}
        />
        <StatCard
          label="Active courses"
          value={data?.activeCourses}
          icon={BookOpen}
          isLoading={isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/student/registration" />}>
            Register for courses
          </Button>
          <Button variant="outline" render={<Link href="/student/timetable" />}>
            View timetable
          </Button>
          <Button variant="outline" render={<Link href="/student/results" />}>
            View results
          </Button>
          <Button variant="outline" render={<Link href="/student/transcript" />}>
            Download transcript
          </Button>
          <Button variant="outline" render={<Link href="/student/fees" />}>
            Pay fees
          </Button>
          <Button variant="outline" render={<Link href="/student/profile" />}>
            Edit profile
          </Button>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-32 w-full" />}
    </div>
  )
}
