"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { useCrud } from "@/hooks/use-crud"
import { RoleGuard } from "@/components/auth/role-guard"
import { DataTable } from "@/components/crud/data-table"
import { EntityFormDialog, type EntityField } from "@/components/crud/entity-form-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import type { Database } from "@/types/database"

type EntryTest = Database["public"]["Tables"]["entry_tests"]["Row"]

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  { ssr: false, loading: () => <Skeleton className="h-8 w-24" /> }
)
const HallTicketDocument = dynamic(
  () => import("@/components/pdf/hall-ticket").then((m) => m.HallTicketDocument),
  { ssr: false }
)

const schema = z.object({
  name: z.string().min(2, "Required"),
  test_date: z.string().min(1, "Required"),
  total_marks: z.number().min(1),
  passing_marks: z.number().min(0),
})
type FormValues = z.infer<typeof schema>

function useApplicationsForTest(entryTestId: string, universityId: string | null) {
  return useQuery({
    queryKey: ["entry-test-results", entryTestId],
    enabled: !!entryTestId && !!universityId,
    queryFn: async () => {
      const supabase = createClient()
      const [{ data: applications }, { data: results }] = await Promise.all([
        supabase
          .from("applications")
          .select("id, application_number, status, applicant_id")
          .eq("university_id", universityId!)
          .in("status", ["submitted", "under_review", "shortlisted"]),
        supabase.from("entry_test_results").select("*").eq("entry_test_id", entryTestId),
      ])

      const applicantIds = [...new Set((applications ?? []).map((a) => a.applicant_id))]
      const { data: profiles } = applicantIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", applicantIds)
        : { data: [] }
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

      const resultByApp = new Map((results ?? []).map((r) => [r.application_id, r]))
      return (applications ?? []).map((a) => ({
        ...a,
        applicantName: nameById.get(a.applicant_id) ?? "Applicant",
        marks: resultByApp.get(a.id)?.marks_obtained ?? null,
        resultId: resultByApp.get(a.id)?.id ?? null,
      }))
    },
  })
}

export default function EntryTestsPage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "registrar"]}>
      <EntryTestsContent />
    </RoleGuard>
  )
}

function EntryTestsContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { list, create } = useCrud("entry_tests", universityId)
  const queryClient = useQueryClient()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [selectedTestId, setSelectedTestId] = React.useState<string>("")

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", test_date: "", total_marks: 100, passing_marks: 40 },
  })

  const fields: EntityField<FormValues>[] = [
    { type: "text", name: "name", label: "Test name" },
    { type: "date", name: "test_date", label: "Test date" },
    { type: "number", name: "total_marks", label: "Total marks" },
    { type: "number", name: "passing_marks", label: "Passing marks" },
  ]

  async function onSubmit(values: FormValues) {
    if (!universityId) return
    await create.mutateAsync({ ...values, university_id: universityId })
    setDialogOpen(false)
  }

  const applications = useApplicationsForTest(selectedTestId, universityId)

  async function saveMarks(applicationId: string, resultId: string | null, marks: number) {
    const supabase = createClient()
    const test = list.data?.find((t) => t.id === selectedTestId)
    const passed = test ? marks >= (test.passing_marks ?? 0) : null

    const { error } = resultId
      ? await supabase.from("entry_test_results").update({ marks_obtained: marks, passed }).eq("id", resultId)
      : await supabase.from("entry_test_results").insert({
          university_id: universityId!,
          entry_test_id: selectedTestId,
          application_id: applicationId,
          marks_obtained: marks,
          passed,
        })
    if (error) {
      toast.error(error.message)
      return
    }
    queryClient.invalidateQueries({ queryKey: ["entry-test-results", selectedTestId] })
  }

  const columns: ColumnDef<EntryTest, unknown>[] = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "test_date", header: "Date" },
    { accessorKey: "total_marks", header: "Total marks" },
    { accessorKey: "passing_marks", header: "Passing marks" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Entry tests</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> New test
        </Button>
      </div>

      <DataTable columns={columns} data={list.data ?? []} isLoading={list.isLoading} searchPlaceholder="Search tests..." />

      <EntityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="New entry test"
        form={form}
        fields={fields}
        onSubmit={onSubmit}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Result entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedTestId} onValueChange={(v) => setSelectedTestId(v ?? "")}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a test" />
            </SelectTrigger>
            <SelectContent>
              {(list.data ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedTestId && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application #</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Hall ticket</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(applications.data ?? []).map((a) => {
                  const test = list.data?.find((t) => t.id === selectedTestId)
                  return (
                    <TableRow key={a.id}>
                      <TableCell>{a.application_number}</TableCell>
                      <TableCell>{a.applicantName}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          defaultValue={a.marks ?? ""}
                          className="w-24"
                          onBlur={(e) =>
                            e.target.value && saveMarks(a.id, a.resultId, Number(e.target.value))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {test && (
                          <PDFDownloadLink
                            document={
                              <HallTicketDocument
                                data={{
                                  testName: test.name,
                                  testDate: test.test_date ?? "TBA",
                                  applicantName: a.applicantName,
                                  applicationNumber: a.application_number,
                                  totalMarks: test.total_marks,
                                }}
                              />
                            }
                            fileName={`hall-ticket-${a.application_number}.pdf`}
                          >
                            {({ loading }: { loading: boolean }) => (
                              <Button size="sm" variant="outline" disabled={loading}>
                                {loading ? "..." : "Download"}
                              </Button>
                            )}
                          </PDFDownloadLink>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
