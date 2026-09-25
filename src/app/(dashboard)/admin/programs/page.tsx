"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import type { ColumnDef } from "@tanstack/react-table"
import { Plus, Pencil, Trash2 } from "lucide-react"

import { useUser } from "@/hooks/use-user"
import { useCrud } from "@/hooks/use-crud"
import { RoleGuard } from "@/components/auth/role-guard"
import { DataTable } from "@/components/crud/data-table"
import { EntityFormDialog, type EntityField } from "@/components/crud/entity-form-dialog"
import { DeleteConfirmDialog } from "@/components/crud/delete-confirm-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Database, DegreeLevel } from "@/types/database"

type Program = Database["public"]["Tables"]["programs"]["Row"]

const DEGREE_LEVELS: DegreeLevel[] = [
  "certificate",
  "diploma",
  "associate",
  "bachelor",
  "master",
  "phd",
  "postdoc",
]

const schema = z.object({
  name: z.string().min(2, "Required"),
  code: z.string().min(1, "Required"),
  department_id: z.string().min(1, "Required"),
  degree_level: z.enum(DEGREE_LEVELS as [DegreeLevel, ...DegreeLevel[]]),
  duration_years: z.number().min(0.5).max(10),
  total_credit_hours: z.number().int().min(1),
  is_active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

const defaults: FormValues = {
  name: "",
  code: "",
  department_id: "",
  degree_level: "bachelor",
  duration_years: 4,
  total_credit_hours: 120,
  is_active: true,
}

export default function ProgramsPage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "dean", "hod"]}>
      <ProgramsContent />
    </RoleGuard>
  )
}

function ProgramsContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { list, create, update, remove, removeMany } = useCrud("programs", universityId)
  const { list: departments } = useCrud("departments", universityId)

  const departmentOptions = (departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))
  const departmentName = (id: string) => departments.data?.find((d) => d.id === id)?.name ?? "—"

  const fields: EntityField<FormValues>[] = [
    { type: "text", name: "name", label: "Name" },
    { type: "text", name: "code", label: "Code" },
    { type: "select", name: "department_id", label: "Department", options: departmentOptions },
    {
      type: "select",
      name: "degree_level",
      label: "Degree level",
      options: DEGREE_LEVELS.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) })),
    },
    { type: "number", name: "duration_years", label: "Duration (years)" },
    { type: "number", name: "total_credit_hours", label: "Total credit hours" },
    { type: "switch", name: "is_active", label: "Active" },
  ]

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Program | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Program | null>(null)
  const [selectedRows, setSelectedRows] = React.useState<Program[]>([])

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults })

  function openCreate() {
    setEditing(null)
    form.reset(defaults)
    setDialogOpen(true)
  }

  function openEdit(row: Program) {
    setEditing(row)
    form.reset({
      name: row.name,
      code: row.code,
      department_id: row.department_id,
      degree_level: row.degree_level,
      duration_years: row.duration_years,
      total_credit_hours: row.total_credit_hours,
      is_active: row.is_active,
    })
    setDialogOpen(true)
  }

  async function onSubmit(values: FormValues) {
    if (!universityId) return
    if (editing) {
      await update.mutateAsync({ id: editing.id, values })
    } else {
      await create.mutateAsync({ ...values, university_id: universityId })
    }
    setDialogOpen(false)
  }

  const columns: ColumnDef<Program, unknown>[] = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "code", header: "Code" },
    {
      id: "department",
      header: "Department",
      cell: ({ row }) => departmentName(row.original.department_id),
    },
    {
      accessorKey: "degree_level",
      header: "Level",
      cell: ({ row }) => <Badge variant="outline">{row.original.degree_level}</Badge>,
    },
    { accessorKey: "duration_years", header: "Years" },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(row.original)}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(row.original)}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Programs</h1>
          <p className="text-sm text-muted-foreground">Manage degree programs.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> New program
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={list.data ?? []}
        isLoading={list.isLoading}
        searchPlaceholder="Search programs..."
        enableRowSelection
        onRowSelectionChange={setSelectedRows}
        toolbar={
          selectedRows.length > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => removeMany.mutate(selectedRows.map((r) => r.id))}
            >
              Delete {selectedRows.length} selected
            </Button>
          ) : null
        }
      />

      <EntityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit program" : "New program"}
        form={form}
        fields={fields}
        onSubmit={onSubmit}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id)
          setDeleteTarget(null)
        }}
        title={`Delete ${deleteTarget?.name}?`}
      />
    </div>
  )
}
