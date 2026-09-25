"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import type { ColumnDef } from "@tanstack/react-table"
import { Plus, Upload, Download, MoreHorizontal, ArrowRightLeft, Ban } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { useCrud } from "@/hooks/use-crud"
import { RoleGuard } from "@/components/auth/role-guard"
import { DataTable } from "@/components/crud/data-table"
import { EntityFormDialog, type EntityField } from "@/components/crud/entity-form-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Database } from "@/types/database"

type Student = Database["public"]["Tables"]["students"]["Row"]
type StudentWithProfile = Student & { full_name: string | null }

const STATUS_OPTIONS = [
  "active",
  "on_leave",
  "suspended",
  "graduated",
  "withdrawn",
  "dismissed",
  "deferred",
] as const

function useStudentsWithProfiles(universityId: string | null) {
  return useQuery({
    queryKey: ["students-with-profiles", universityId],
    enabled: !!universityId,
    queryFn: async (): Promise<StudentWithProfile[]> => {
      const supabase = createClient()
      const { data: students, error } = await supabase
        .from("students")
        .select("*")
        .eq("university_id", universityId!)
        .order("created_at", { ascending: false })
      if (error) throw error

      const ids = students.map((s) => s.id)
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] }

      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
      return students.map((s) => ({ ...s, full_name: nameById.get(s.id) ?? null }))
    },
  })
}

function exportCsv(rows: StudentWithProfile[]) {
  const header = ["Name", "Student Number", "Status", "Enrollment Date", "GPA"]
  const lines = rows.map((r) =>
    [r.full_name ?? "", r.student_number, r.status, r.enrollment_date, r.cumulative_gpa].join(",")
  )
  const csv = [header.join(","), ...lines].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "students.csv"
  a.click()
  URL.revokeObjectURL(url)
}

export default function StudentsPage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "registrar", "dean", "hod"]}>
      <StudentsContent />
    </RoleGuard>
  )
}

function StudentsContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const queryClient = useQueryClient()

  const students = useStudentsWithProfiles(universityId)
  const { list: programs } = useCrud("programs", universityId)

  const [programFilter, setProgramFilter] = React.useState<string>("all")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [batchFilter, setBatchFilter] = React.useState<string>("all")

  const batches = React.useMemo(() => {
    const years = new Set((students.data ?? []).map((s) => s.enrollment_date?.slice(0, 4)))
    return Array.from(years).filter(Boolean).sort().reverse()
  }, [students.data])

  const filtered = React.useMemo(() => {
    return (students.data ?? []).filter((s) => {
      if (programFilter !== "all" && s.program_id !== programFilter) return false
      if (statusFilter !== "all" && s.status !== statusFilter) return false
      if (batchFilter !== "all" && s.enrollment_date?.slice(0, 4) !== batchFilter) return false
      return true
    })
  }, [students.data, programFilter, statusFilter, batchFilter])

  const programName = (id: string) => programs.data?.find((p) => p.id === id)?.name ?? "—"

  async function quickUpdateStatus(id: string, status: Student["status"]) {
    const supabase = createClient()
    const { error } = await supabase.from("students").update({ status }).eq("id", id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Status updated")
    queryClient.invalidateQueries({ queryKey: ["students-with-profiles", universityId] })
  }

  const [transferTarget, setTransferTarget] = React.useState<StudentWithProfile | null>(null)

  const columns: ColumnDef<StudentWithProfile, unknown>[] = [
    {
      accessorKey: "full_name",
      header: "Name",
      cell: ({ row }) => (
        <Link href={`/admin/students/${row.original.id}`} className="font-medium hover:underline">
          {row.original.full_name ?? "Unnamed"}
        </Link>
      ),
    },
    { accessorKey: "student_number", header: "Roll no." },
    { id: "program", header: "Program", cell: ({ row }) => programName(row.original.program_id) },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "active" ? "default" : "secondary"}>
          {row.original.status}
        </Badge>
      ),
    },
    { accessorKey: "cumulative_gpa", header: "CGPA" },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-md p-1 hover:bg-muted">
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem render={<Link href={`/admin/students/${row.original.id}`} />}>
              View profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTransferTarget(row.original)}>
              <ArrowRightLeft /> Transfer program
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => quickUpdateStatus(row.original.id, "suspended")}
            >
              <Ban /> Deactivate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} students</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportCsv(filtered)}>
            <Download className="size-4" /> Export CSV
          </Button>
          <BulkImportDialog universityId={universityId} />
          <AddStudentDialog universityId={universityId} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={programFilter} onValueChange={(v) => setProgramFilter(v ?? "all")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Program" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All programs</SelectItem>
            {(programs.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={batchFilter} onValueChange={(v) => setBatchFilter(v ?? "all")}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Batch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All batches</SelectItem>
            {batches.map((b) => (
              <SelectItem key={b} value={b!}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={students.isLoading}
        searchPlaceholder="Search by name or roll number..."
      />

      {transferTarget && (
        <TransferDialog
          student={transferTarget}
          universityId={universityId!}
          onClose={() => setTransferTarget(null)}
        />
      )}
    </div>
  )
}

// ---- Add student (manual) ------------------------------------------------

const addSchema = z.object({
  full_name: z.string().min(2, "Required"),
  email: z.string().email("Enter a valid email"),
  program_id: z.string().min(1, "Required"),
  student_number: z.string().min(1, "Required"),
})
type AddValues = z.infer<typeof addSchema>

function AddStudentDialog({ universityId }: { universityId: string | null }) {
  const [open, setOpen] = React.useState(false)
  const queryClient = useQueryClient()
  const { list: programs } = useCrud("programs", universityId)

  const fields: EntityField<AddValues>[] = [
    { type: "text", name: "full_name", label: "Full name" },
    { type: "text", name: "email", label: "Email" },
    { type: "text", name: "student_number", label: "Student / roll number" },
    {
      type: "select",
      name: "program_id",
      label: "Program",
      options: (programs.data ?? []).map((p) => ({ value: p.id, label: p.name })),
    },
  ]

  const form = useForm<AddValues>({
    resolver: zodResolver(addSchema),
    defaultValues: { full_name: "", email: "", program_id: "", student_number: "" },
  })

  async function onSubmit(values: AddValues) {
    if (!universityId) return
    const res = await fetch("/api/admin/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, university_id: universityId }),
    })
    const body = await res.json()
    if (!res.ok) {
      toast.error(body.error ?? "Failed to add student")
      return
    }
    toast.success("Student invited — they'll receive an email to set their password.")
    form.reset()
    setOpen(false)
    queryClient.invalidateQueries({ queryKey: ["students-with-profiles", universityId] })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add student
      </Button>
      <EntityFormDialog
        open={open}
        onOpenChange={setOpen}
        title="Add student"
        description="They'll receive an email invite to set their password."
        form={form}
        fields={fields}
        onSubmit={onSubmit}
      />
    </>
  )
}

// ---- Bulk CSV import -------------------------------------------------------

function parseCsv(text: string): Record<string, string>[] {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/)
  const headers = headerLine.split(",").map((h) => h.trim())
  return lines
    .filter(Boolean)
    .map((line) => {
      const cells = line.split(",")
      return Object.fromEntries(headers.map((h, i) => [h, cells[i]?.trim() ?? ""]))
    })
}

function BulkImportDialog({ universityId }: { universityId: string | null }) {
  const [open, setOpen] = React.useState(false)
  const [isImporting, setIsImporting] = React.useState(false)
  const [results, setResults] = React.useState<{ email: string; status: string; error?: string }[] | null>(
    null
  )
  const queryClient = useQueryClient()

  async function handleFile(file: File) {
    const text = await file.text()
    const rows = parseCsv(text).map((r) => ({
      full_name: r.full_name ?? r.name,
      email: r.email,
      program_id: r.program_id,
      student_number: r.student_number ?? r.roll_number,
      university_id: universityId,
    }))

    setIsImporting(true)
    const res = await fetch("/api/admin/students/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    })
    const body = await res.json()
    setIsImporting(false)
    if (!res.ok) {
      toast.error(body.error ?? "Import failed")
      return
    }
    setResults(body.results)
    queryClient.invalidateQueries({ queryKey: ["students-with-profiles", universityId] })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="size-4" /> Bulk import
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk import students (CSV)</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            CSV columns: <code>full_name, email, program_id, student_number</code>.
            Program IDs are found on the Programs page.
          </p>
          <Input
            type="file"
            accept=".csv"
            disabled={isImporting}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {results && (
            <div className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {results.map((r, i) => (
                <div key={i} className="flex justify-between">
                  <span>{r.email}</span>
                  <span className={r.status === "created" ? "text-primary" : "text-destructive"}>
                    {r.status === "created" ? "Created" : r.error}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---- Transfer program ------------------------------------------------------

const transferSchema = z.object({ program_id: z.string().min(1, "Required") })
type TransferValues = z.infer<typeof transferSchema>

function TransferDialog({
  student,
  universityId,
  onClose,
}: {
  student: StudentWithProfile
  universityId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { list: programs } = useCrud("programs", universityId)
  const form = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: { program_id: student.program_id },
  })

  async function onSubmit(values: TransferValues) {
    const supabase = createClient()
    const { error } = await supabase
      .from("students")
      .update({ program_id: values.program_id })
      .eq("id", student.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Student transferred")
    queryClient.invalidateQueries({ queryKey: ["students-with-profiles", universityId] })
    onClose()
  }

  return (
    <EntityFormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Transfer ${student.full_name}`}
      form={form}
      fields={[
        {
          type: "select",
          name: "program_id",
          label: "New program",
          options: (programs.data ?? []).map((p) => ({ value: p.id, label: p.name })),
        },
      ]}
      onSubmit={onSubmit}
      submitLabel="Transfer"
    />
  )
}
