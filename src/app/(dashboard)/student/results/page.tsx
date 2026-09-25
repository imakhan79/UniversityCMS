"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { RoleGuard } from "@/components/auth/role-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function useMyGrades(studentId: string | undefined) {
  return useQuery({
    queryKey: ["my-grades", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("grades")
        .select("*")
        .eq("student_id", studentId!)
        .eq("is_final", true)
      if (error) throw error
      return data
    },
  })
}

export default function StudentResultsPage() {
  return (
    <RoleGuard allow={["student"]}>
      <StudentResultsContent />
    </RoleGuard>
  )
}

function StudentResultsContent() {
  const { data: user } = useUser()
  const { data: grades, isLoading } = useMyGrades(user?.id)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Final grades</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (grades ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No results published yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marks</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Grade points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grades!.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>{g.marks_obtained ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{g.letter_grade ?? "—"}</Badge>
                    </TableCell>
                    <TableCell>{g.grade_points ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
