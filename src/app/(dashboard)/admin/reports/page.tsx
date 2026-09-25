"use client"

import { useQuery } from "@tanstack/react-query"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { gradeDistribution } from "@/lib/academics/gpa"
import { RoleGuard } from "@/components/auth/role-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const CHART_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#ea580c"]

function useGradeDistribution(universityId: string | null) {
  return useQuery({
    queryKey: ["grade-distribution", universityId],
    enabled: !!universityId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("grades")
        .select("letter_grade")
        .eq("university_id", universityId!)
        .eq("is_final", true)
      if (error) throw error
      return gradeDistribution(
        data.map((g) => ({
          semesterId: "",
          semesterName: "",
          courseTitle: "",
          courseCode: "",
          creditHours: 0,
          letterGrade: g.letter_grade,
          gradePoints: null,
        }))
      )
    },
  })
}

export default function AdminReportsPage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "registrar", "dean", "hod"]}>
      <AdminReportsContent />
    </RoleGuard>
  )
}

function AdminReportsContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { data, isLoading } = useGradeDistribution(universityId)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Academic reports</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grade distribution</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="grade" fontSize={12} tickLine={false} />
                <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {(data ?? []).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
