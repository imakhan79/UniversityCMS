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
import type { Database } from "@/types/database"

type Semester = Database["public"]["Tables"]["semesters"]["Row"]

const schema = z
  .object({
    name: z.string().min(2, "Required"),
    code: z.string().min(1, "Required"),
    academic_year: z.string().min(4, "Required"),
    start_date: z.string().min(1, "Required"),
    end_date: z.string().min(1, "Required"),
    is_current: z.boolean(),
  })
  .refine((d) => d.end_date > d.start_date, {
    message: "End date must be after start date",
    path: ["end_date"],
  })
type FormValues = z.infer<typeof schema>

const defaults: FormValues = {
  name: "",
  code: "",
  academic_year: "",
  start_date: "",
  end_date: "",
  is_current: false,
}

export default function SemestersPage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "registrar"]}>
      <SemestersContent />
    </RoleGuard>
  )
}

function SemestersContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { list, create, update, remove, removeMany } = useCrud("semesters", universityId)

  const fields: EntityField<FormValues>[] = [
    { type: "text", name: "name", label: "Name" },
    { type: "text", name: "code", label: "Code" },
    { type: "text", name: "academic_year", label: "Academic year (e.g. 2026-2027)" },
    { type: "date", name: "start_date", label: "Start date" },
    { type: "date", name: "end_date", label: "End date" },
    { type: "switch", name: "is_current", label: "Current semester" },
  ]

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Semester | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Semester | null>(null)
  const [selectedRows, setSelectedRows] = React.useState<Semester[]>([])

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults })

  function openCreate() {
    setEditing(null)
    form.reset(defaults)
    setDialogOpen(true)
  }

  function openEdit(row: Semester) {
    setEditing(row)
    form.reset({
      name: row.name,
      code: row.code,
      academic_year: row.academic_year,
      start_date: row.start_date,
      end_date: row.end_date,
      is_current: row.is_current,
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

  const columns: ColumnDef<Semester, unknown>[] = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "academic_year", header: "Academic year" },
    { accessorKey: "start_date", header: "Start" },
    { accessorKey: "end_date", header: "End" },
    {
      accessorKey: "is_current",
      header: "Status",
      cell: ({ row }) => (row.original.is_current ? <Badge>Current</Badge> : null),
    },
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
          <h1 className="text-2xl font-semibold tracking-tight">Semesters</h1>
          <p className="text-sm text-muted-foreground">Manage academic terms.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> New semester
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={list.data ?? []}
        isLoading={list.isLoading}
        searchPlaceholder="Search semesters..."
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
        title={editing ? "Edit semester" : "New semester"}
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
