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

type Faculty = Database["public"]["Tables"]["faculties"]["Row"]

const schema = z.object({
  name: z.string().min(2, "Required"),
  code: z.string().min(1, "Required"),
  campus_id: z.string().optional(),
  is_active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

const defaults: FormValues = { name: "", code: "", campus_id: "", is_active: true }

export default function FacultiesPage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "dean"]}>
      <FacultiesContent />
    </RoleGuard>
  )
}

function FacultiesContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { list, create, update, remove, removeMany } = useCrud("faculties", universityId)
  const { list: campuses } = useCrud("campuses", universityId)

  const campusOptions = (campuses.data ?? []).map((c) => ({ value: c.id, label: c.name }))
  const campusName = (id: string | null) => campuses.data?.find((c) => c.id === id)?.name ?? "—"

  const fields: EntityField<FormValues>[] = [
    { type: "text", name: "name", label: "Name" },
    { type: "text", name: "code", label: "Code" },
    { type: "select", name: "campus_id", label: "Campus", options: campusOptions },
    { type: "switch", name: "is_active", label: "Active" },
  ]

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Faculty | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Faculty | null>(null)
  const [selectedRows, setSelectedRows] = React.useState<Faculty[]>([])

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults })

  function openCreate() {
    setEditing(null)
    form.reset(defaults)
    setDialogOpen(true)
  }

  function openEdit(row: Faculty) {
    setEditing(row)
    form.reset({
      name: row.name,
      code: row.code,
      campus_id: row.campus_id ?? "",
      is_active: row.is_active,
    })
    setDialogOpen(true)
  }

  async function onSubmit(values: FormValues) {
    if (!universityId) return
    const payload = { ...values, campus_id: values.campus_id || null }
    if (editing) {
      await update.mutateAsync({ id: editing.id, values: payload })
    } else {
      await create.mutateAsync({ ...payload, university_id: universityId })
    }
    setDialogOpen(false)
  }

  const columns: ColumnDef<Faculty, unknown>[] = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "code", header: "Code" },
    {
      id: "campus",
      header: "Campus",
      cell: ({ row }) => campusName(row.original.campus_id),
    },
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
          <h1 className="text-2xl font-semibold tracking-tight">Faculties</h1>
          <p className="text-sm text-muted-foreground">Manage academic faculties.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> New faculty
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={list.data ?? []}
        isLoading={list.isLoading}
        searchPlaceholder="Search faculties..."
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
        title={editing ? "Edit faculty" : "New faculty"}
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
