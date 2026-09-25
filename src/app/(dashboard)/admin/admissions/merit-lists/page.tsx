"use client"

import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { useCrud } from "@/hooks/use-crud"
import { RoleGuard } from "@/components/auth/role-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function useShortlistedApplications(programId: string, universityId: string | null) {
  return useQuery({
    queryKey: ["merit-applications", programId],
    enabled: !!programId && !!universityId,
    queryFn: async () => {
      const supabase = createClient()
      const { data: applications } = await supabase
        .from("applications")
        .select("id, application_number")
        .eq("university_id", universityId!)
        .eq("program_id", programId)
        .in("status", ["submitted", "under_review", "shortlisted"])

      const appIds = (applications ?? []).map((a) => a.id)
      const { data: results } = appIds.length
        ? await supabase.from("entry_test_results").select("application_id, marks_obtained").in("application_id", appIds)
        : { data: [] }

      const marksByApp = new Map((results ?? []).map((r) => [r.application_id, r.marks_obtained ?? 0]))
      return (applications ?? []).map((a) => ({ ...a, testMarks: marksByApp.get(a.id) ?? 0 }))
    },
  })
}

export default function MeritListsPage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "registrar"]}>
      <MeritListsContent />
    </RoleGuard>
  )
}

function MeritListsContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { list: programs } = useCrud("programs", universityId)
  const queryClient = useQueryClient()

  const [programId, setProgramId] = React.useState("")
  const [testWeight, setTestWeight] = React.useState(70)
  const [academicWeight, setAcademicWeight] = React.useState(30)
  const [academicScores, setAcademicScores] = React.useState<Record<string, number>>({})
  const [seatsAvailable, setSeatsAvailable] = React.useState(30)

  const applications = useShortlistedApplications(programId, universityId)

  const ranked = React.useMemo(() => {
    const totalWeight = testWeight + academicWeight || 1
    return (applications.data ?? [])
      .map((a) => {
        const academic = academicScores[a.id] ?? 0
        const score =
          (a.testMarks * testWeight + academic * academicWeight) / totalWeight
        return { ...a, academic, score }
      })
      .sort((a, b) => b.score - a.score)
  }, [applications.data, academicScores, testWeight, academicWeight])

  async function publishMeritList() {
    if (!universityId || !programId || ranked.length === 0) return
    const supabase = createClient()

    const { data: meritList, error } = await supabase
      .from("merit_lists")
      .insert({
        university_id: universityId,
        program_id: programId,
        name: `Merit List — ${new Date().toLocaleDateString()}`,
        is_final: true,
        published_at: new Date().toISOString(),
        published_by: user!.id,
      })
      .select("id")
      .single()

    if (error || !meritList) {
      toast.error(error?.message ?? "Failed to publish")
      return
    }

    const entries = ranked.map((r, i) => ({
      university_id: universityId,
      merit_list_id: meritList.id,
      application_id: r.id,
      rank: i + 1,
      score: r.score,
    }))
    const { error: entriesError } = await supabase.from("merit_list_entries").insert(entries)
    if (entriesError) {
      toast.error(entriesError.message)
      return
    }

    toast.success("Merit list published")
    queryClient.invalidateQueries({ queryKey: ["merit-applications", programId] })
    return meritList.id
  }

  async function allocateSeats() {
    const meritListId = await publishMeritList()
    if (!meritListId || !universityId) return

    const supabase = createClient()
    const topRanked = ranked.slice(0, seatsAvailable)
    const allocations = topRanked.map((r) => ({
      university_id: universityId,
      application_id: r.id,
      program_id: programId,
      seat_category: "open",
      status: "allocated",
    }))
    const { error } = await supabase.from("seat_allocations").insert(allocations)
    if (error) {
      toast.error(error.message)
      return
    }
    await supabase
      .from("applications")
      .update({ status: "accepted" })
      .in(
        "id",
        topRanked.map((r) => r.id)
      )
    toast.success(`Allocated ${topRanked.length} seats`)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Merit lists</h1>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="grid gap-1.5">
            <Label>Program</Label>
            <Select value={programId} onValueChange={(v) => setProgramId(v ?? "")}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select program" />
              </SelectTrigger>
              <SelectContent>
                {(programs.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Test weight (%)</Label>
            <Input
              type="number"
              className="w-24"
              value={testWeight}
              onChange={(e) => setTestWeight(Number(e.target.value))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Academic weight (%)</Label>
            <Input
              type="number"
              className="w-24"
              value={academicWeight}
              onChange={(e) => setAcademicWeight(Number(e.target.value))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Seats available</Label>
            <Input
              type="number"
              className="w-24"
              value={seatsAvailable}
              onChange={(e) => setSeatsAvailable(Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      {programId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranked candidates ({ranked.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Application #</TableHead>
                  <TableHead>Test marks</TableHead>
                  <TableHead>Academic score</TableHead>
                  <TableHead>Weighted score</TableHead>
                  <TableHead>Seat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranked.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>{r.application_number}</TableCell>
                    <TableCell>{r.testMarks}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-20"
                        value={academicScores[r.id] ?? ""}
                        onChange={(e) =>
                          setAcademicScores((s) => ({ ...s, [r.id]: Number(e.target.value) }))
                        }
                      />
                    </TableCell>
                    <TableCell>{r.score.toFixed(1)}</TableCell>
                    <TableCell>{i < seatsAvailable && <Badge>Allocated</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex gap-2">
              <Button variant="outline" onClick={publishMeritList}>
                Publish merit list
              </Button>
              <Button onClick={allocateSeats}>Publish & allocate seats</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
