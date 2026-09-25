"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import type { ColumnDef } from "@tanstack/react-table"
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { useUser } from "@/hooks/use-user"
import { useCrud } from "@/hooks/use-crud"
import { useFacultyOptions } from "@/hooks/use-faculty-options"
import { WEEKDAYS, findScheduleConflicts } from "@/lib/academics/schedule"
import { RoleGuard } from "@/components/auth/role-guard"
import { DataTable } from "@/components/crud/data-table"
import { DeleteConfirmDialog } from "@/components/crud/delete-confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import type { Database } from "@/types/database"

type CourseOffering = Database["public"]["Tables"]["course_offerings"]["Row"]

const schema = z.object({
  course_id: z.string().min(1, "Required"),
  semester_id: z.string().min(1, "Required"),
  instructor_id: z.string().optional(),
  section_code: z.string().min(1, "Required"),
  max_seats: z.number().int().min(1),
  room: z.string().optional(),
  day: z.string().min(1, "Required"),
  start_time: z.string().min(1, "Required"),
  end_time: z.string().min(1, "Required"),
})
type FormValues = z.infer<typeof schema>

const defaults: FormValues = {
  course_id: "",
  semester_id: "",
  instructor_id: "",
  section_code: "A",
  max_seats: 40,
  room: "",
  day: "Mon",
  start_time: "09:00",
  end_time: "10:00",
}

export default function CourseOfferingsPage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "dean", "hod"]}>
      <CourseOfferingsContent />
    </RoleGuard>
  )
}

function CourseOfferingsContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { list, create, update, remove } = useCrud("course_offerings", universityId)
  const { list: courses } = useCrud("courses", universityId)
  const { list: semesters } = useCrud("semesters", universityId)
  const { data: facultyOptions } = useFacultyOptions(universityId)

  const courseName = (id: string) => courses.data?.find((c) => c.id === id)?.title ?? "—"
  const semesterName = (id: string) => semesters.data?.find((s) => s.id === id)?.name ?? "—"
  const facultyName = (id: string | null) =>
    facultyOptions?.find((f) => f.value === id)?.label ?? "Unassigned"

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CourseOffering | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<CourseOffering | null>(null)

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults })

  function openCreate() {
    setEditing(null)
    form.reset(defaults)
    setDialogOpen(true)
  }

  function openEdit(row: CourseOffering) {
    setEditing(row)
    const slot = row.schedule[0]
    form.reset({
      course_id: row.course_id,
      semester_id: row.semester_id,
      instructor_id: row.instructor_id ?? "",
      section_code: row.section_code,
      max_seats: row.max_seats,
      room: row.room ?? "",
      day: slot?.day ?? "Mon",
      start_time: slot?.start ?? "09:00",
      end_time: slot?.end ?? "10:00",
    })
    setDialogOpen(true)
  }

  async function onSubmit(values: FormValues) {
    if (!universityId) return
    if (values.start_time >= values.end_time) {
      form.setError("end_time", { message: "Must be after start time" })
      return
    }

    const newSlot = { day: values.day, start: values.start_time, end: values.end_time }

    const sameInstructor = (list.data ?? []).filter(
      (o) => o.semester_id === values.semester_id && o.instructor_id === values.instructor_id
    )
    const sameRoom = (list.data ?? []).filter(
      (o) => o.semester_id === values.semester_id && o.room === values.room && values.room
    )

    const conflicts = [
      ...findScheduleConflicts([newSlot], sameInstructor, editing?.id),
      ...findScheduleConflicts([newSlot], sameRoom, editing?.id),
    ]

    if (conflicts.length > 0) {
      toast.error(
        `Schedule conflict with section ${conflicts[0].section_code} (${courseName(conflicts[0].course_id)}).`
      )
      return
    }

    const payload = {
      course_id: values.course_id,
      semester_id: values.semester_id,
      instructor_id: values.instructor_id || null,
      section_code: values.section_code,
      max_seats: values.max_seats,
      room: values.room || null,
      schedule: [newSlot],
    }

    if (editing) {
      await update.mutateAsync({ id: editing.id, values: payload })
    } else {
      await create.mutateAsync({ ...payload, university_id: universityId })
    }
    setDialogOpen(false)
  }

  const columns: ColumnDef<CourseOffering, unknown>[] = [
    { id: "course", header: "Course", cell: ({ row }) => courseName(row.original.course_id) },
    { accessorKey: "section_code", header: "Section" },
    { id: "semester", header: "Semester", cell: ({ row }) => semesterName(row.original.semester_id) },
    {
      id: "instructor",
      header: "Instructor",
      cell: ({ row }) => facultyName(row.original.instructor_id),
    },
    {
      id: "schedule",
      header: "Schedule",
      cell: ({ row }) => {
        const s = row.original.schedule[0]
        return s ? `${s.day} ${s.start}-${s.end}` : "—"
      },
    },
    {
      id: "seats",
      header: "Seats",
      cell: ({ row }) => `${row.original.enrolled_count}/${row.original.max_seats}`,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
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
          <h1 className="text-2xl font-semibold tracking-tight">Course offerings</h1>
          <p className="text-sm text-muted-foreground">
            Sections of courses taught in a given semester.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> New offering
        </Button>
      </div>

      <DataTable columns={columns} data={list.data ?? []} isLoading={list.isLoading} searchPlaceholder="Search offerings..." />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit offering" : "New offering"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="course_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Course</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select course" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(courses.data ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.code} — {c.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="semester_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Semester</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select semester" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(semesters.data ?? []).map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="instructor_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instructor</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select instructor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(facultyOptions ?? []).map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="section_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Section</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="max_seats"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacity</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="room"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Room</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="day"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {WEEKDAYS.map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="start_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="end_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="size-3.5" /> One weekly time slot per offering; conflicting
                instructor/room bookings in the same semester are blocked on save.
              </p>

              <DialogFooter>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id)
          setDeleteTarget(null)
        }}
        title="Delete this offering?"
      />
    </div>
  )
}
