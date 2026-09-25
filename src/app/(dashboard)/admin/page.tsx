"use client"

import { useQuery } from "@tanstack/react-query"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Users, UserCog, GraduationCap, Wallet, ClipboardCheck, FileCheck } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { StatCard } from "@/components/dashboard/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RoleGuard } from "@/components/auth/role-guard"

const CHART_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed"]

function useUniversityId() {
  const { data: user } = useUser()
  return user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
}

function useDashboardStats(universityId: string | null) {
  return useQuery({
    queryKey: ["admin-dashboard-stats", universityId],
    enabled: !!universityId,
    queryFn: async () => {
      const supabase = createClient()

      const [
        students,
        employees,
        programs,
        invoices,
        attendance,
        results,
      ] = await Promise.all([
        supabase
          .from("students")
          .select("id, status", { count: "exact" })
          .eq("university_id", universityId!),
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("university_id", universityId!),
        supabase
          .from("programs")
          .select("id", { count: "exact", head: true })
          .eq("university_id", universityId!),
        supabase
          .from("fee_invoices")
          .select("amount_due, amount_paid, status")
          .eq("university_id", universityId!),
        supabase
          .from("attendance")
          .select("status")
          .eq("university_id", universityId!),
        supabase
          .from("results")
          .select("status, published")
          .eq("university_id", universityId!),
      ])

      const totalRevenue = (invoices.data ?? []).reduce((sum, i) => sum + i.amount_paid, 0)
      const pendingFees = (invoices.data ?? []).reduce(
        (sum, i) => sum + (i.amount_due - i.amount_paid),
        0
      )

      const attendanceRows = attendance.data ?? []
      const presentCount = attendanceRows.filter((a) => a.status === "present").length
      const attendancePct =
        attendanceRows.length > 0 ? Math.round((presentCount / attendanceRows.length) * 100) : 0

      const resultRows = results.data ?? []
      const passCount = resultRows.filter((r) => r.status === "pass").length
      const failCount = resultRows.filter((r) => r.status === "fail").length

      const studentsByStatus = (students.data ?? []).reduce<Record<string, number>>(
        (acc, s) => {
          acc[s.status] = (acc[s.status] ?? 0) + 1
          return acc
        },
        {}
      )

      return {
        totalStudents: students.count ?? 0,
        totalEmployees: employees.count ?? 0,
        totalPrograms: programs.count ?? 0,
        totalRevenue,
        pendingFees,
        attendancePct,
        passCount,
        failCount,
        studentsByStatus: Object.entries(studentsByStatus).map(([status, count]) => ({
          status,
          count,
        })),
      }
    },
  })
}

export default function AdminDashboardPage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "registrar"]}>
      <AdminDashboardContent />
    </RoleGuard>
  )
}

function AdminDashboardContent() {
  const universityId = useUniversityId()
  const { data: stats, isLoading } = useDashboardStats(universityId)

  const examChartData = [
    { name: "Pass", value: stats?.passCount ?? 0 },
    { name: "Fail", value: stats?.failCount ?? 0 },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          A snapshot of your university, right now.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Students"
          value={stats?.totalStudents}
          icon={Users}
          isLoading={isLoading}
        />
        <StatCard
          label="Faculty & Staff"
          value={stats?.totalEmployees}
          icon={UserCog}
          isLoading={isLoading}
        />
        <StatCard
          label="Programs"
          value={stats?.totalPrograms}
          icon={GraduationCap}
          isLoading={isLoading}
        />
        <StatCard
          label="Revenue collected"
          value={stats ? `$${stats.totalRevenue.toLocaleString()}` : undefined}
          icon={Wallet}
          isLoading={isLoading}
        />
        <StatCard
          label="Pending fees"
          value={stats ? `$${stats.pendingFees.toLocaleString()}` : undefined}
          icon={Wallet}
          isLoading={isLoading}
        />
        <StatCard
          label="Attendance rate"
          value={stats ? `${stats.attendancePct}%` : undefined}
          icon={ClipboardCheck}
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Students by status</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.studentsByStatus ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="status" fontSize={12} tickLine={false} />
                <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {(stats?.studentsByStatus ?? []).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck className="size-4" /> Exam results
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={examChartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                >
                  {examChartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
