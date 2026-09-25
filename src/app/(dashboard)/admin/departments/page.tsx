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

type Department = Database["public"]["Tables"]["departments"]["Row"]

const schema = z.object({
  name: z.string().min(2, "Required"),
  code: z.string().min(1, "Required"),
  faculty_id: z.string().min(1, "Required"),
  is_active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

const defaults: FormValues = { name: "", code: "", faculty_id: "", is_active: true }

export default function DepartmentsPage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "dean", "hod"]}>
      <DepartmentsContent />
    </RoleGuard>
  )
}

function DepartmentsContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { list, create, update, remove, removeMany } = useCrud("departments", universityId)
  const { list: faculties } = useCrud("faculties", universityId)

  const facultyOptions = (faculties.data ?? []).map((f) => ({ value: f.id, label: f.name }))
  const facultyName = (id: string) => faculties.data?.find((f) => f.id === id)?.name ?? "—"

  const fields: EntityField<FormValues>[] = [
    { type: "text", name: "name", label: "Name" },
    { type: "text", name: "code", label: "Code" },
    { type: "select", name: "faculty_id", label: "Faculty", options: facultyOptions },
    { type: "switch", name: "is_active", label: "Active" },
  ]

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Department | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Department | null>(null)
  const [selectedRows, setSelectedRows] = React.useState<Department[]>([])

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults })

  function openCreate() {
    setEditing(null)
    form.reset(defaults)
    setDialogOpen(true)
  }

  function openEdit(row: Department) {
    setEditing(row)
    form.reset({
      name: row.name,
      code: row.code,
      faculty_id: row.faculty_id,
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

  const columns: ColumnDef<Department, unknown>[] = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "code", header: "Code" },
    { id: "faculty", header: "Faculty", cell: ({ row }) => facultyName(row.original.faculty_id) },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? "default" : "secondary"}>
          {row.original.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
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
          <h1 className="text-2xl font-semibold tracking-tight">Departments</h1>
          <p className="text-sm text-muted-foreground">Manage departments within each faculty.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> New department
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={list.data ?? []}
        isLoading={list.isLoading}
        searchPlaceholder="Search departments..."
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
        title={editing ? "Edit department" : "New department"}
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
