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

type Campus = Database["public"]["Tables"]["campuses"]["Row"]

const schema = z.object({
  name: z.string().min(2, "Required"),
  code: z.string().min(1, "Required"),
  city: z.string().optional(),
  country: z.string().optional(),
  is_main: z.boolean(),
  is_active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

const fields: EntityField<FormValues>[] = [
  { type: "text", name: "name", label: "Name" },
  { type: "text", name: "code", label: "Code" },
  { type: "text", name: "city", label: "City" },
  { type: "text", name: "country", label: "Country" },
  { type: "switch", name: "is_main", label: "Main campus" },
  { type: "switch", name: "is_active", label: "Active" },
]

const defaults: FormValues = {
  name: "",
  code: "",
  city: "",
  country: "",
  is_main: false,
  is_active: true,
}

export default function CampusesPage() {
  return (
    <RoleGuard allow={["super_admin", "admin"]}>
      <CampusesContent />
    </RoleGuard>
  )
}

function CampusesContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { list, create, update, remove, removeMany } = useCrud("campuses", universityId)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Campus | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Campus | null>(null)
  const [selectedRows, setSelectedRows] = React.useState<Campus[]>([])

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults })

  function openCreate() {
    setEditing(null)
    form.reset(defaults)
    setDialogOpen(true)
  }

  function openEdit(row: Campus) {
    setEditing(row)
    form.reset({
      name: row.name,
      code: row.code,
      city: row.city ?? "",
      country: row.country ?? "",
      is_main: row.is_main,
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

  const columns: ColumnDef<Campus, unknown>[] = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "code", header: "Code" },
    { accessorKey: "city", header: "City" },
    {
      accessorKey: "is_main",
      header: "Main",
      cell: ({ row }) => (row.original.is_main ? <Badge>Main</Badge> : null),
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setDeleteTarget(row.original)}
          >
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
          <h1 className="text-2xl font-semibold tracking-tight">Campuses</h1>
          <p className="text-sm text-muted-foreground">Manage your university&apos;s physical campuses.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> New campus
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={list.data ?? []}
        isLoading={list.isLoading}
        searchPlaceholder="Search campuses..."
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
        title={editing ? "Edit campus" : "New campus"}
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
