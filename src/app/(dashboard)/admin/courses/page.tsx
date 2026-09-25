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

type Course = Database["public"]["Tables"]["courses"]["Row"]

const schema = z.object({
  title: z.string().min(2, "Required"),
  code: z.string().min(1, "Required"),
  department_id: z.string().min(1, "Required"),
  description: z.string().optional(),
  credit_hours: z.number().int().min(1).max(12),
  level: z.number().int().min(1).max(8).optional(),
  is_active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

const defaults: FormValues = {
  title: "",
  code: "",
  department_id: "",
  description: "",
  credit_hours: 3,
  level: 1,
  is_active: true,
}

export default function CoursesPage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "hod"]}>
      <CoursesContent />
    </RoleGuard>
  )
}

function CoursesContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { list, create, update, remove, removeMany } = useCrud("courses", universityId)
  const { list: departments } = useCrud("departments", universityId)

  const departmentOptions = (departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))
  const departmentName = (id: string) => departments.data?.find((d) => d.id === id)?.name ?? "—"

  const fields: EntityField<FormValues>[] = [
    { type: "text", name: "title", label: "Title" },
    { type: "text", name: "code", label: "Code" },
    { type: "select", name: "department_id", label: "Department", options: departmentOptions },
    { type: "textarea", name: "description", label: "Description" },
    { type: "number", name: "credit_hours", label: "Credit hours" },
    { type: "number", name: "level", label: "Level" },
    { type: "switch", name: "is_active", label: "Active" },
  ]

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Course | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Course | null>(null)
  const [selectedRows, setSelectedRows] = React.useState<Course[]>([])

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults })

  function openCreate() {
    setEditing(null)
    form.reset(defaults)
    setDialogOpen(true)
  }

  function openEdit(row: Course) {
    setEditing(row)
    form.reset({
      title: row.title,
      code: row.code,
      department_id: row.department_id,
      description: row.description ?? "",
      credit_hours: row.credit_hours,
      level: row.level ?? 1,
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

  const columns: ColumnDef<Course, unknown>[] = [
    { accessorKey: "code", header: "Code" },
    { accessorKey: "title", header: "Title" },
    {
      id: "department",
      header: "Department",
      cell: ({ row }) => departmentName(row.original.department_id),
    },
    { accessorKey: "credit_hours", header: "Credits" },
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
          <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
          <p className="text-sm text-muted-foreground">Manage the course catalog.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> New course
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={list.data ?? []}
        isLoading={list.isLoading}
        searchPlaceholder="Search courses..."
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
        title={editing ? "Edit course" : "New course"}
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
        title={`Delete ${deleteTarget?.title}?`}
      />
    </div>
  )
}
