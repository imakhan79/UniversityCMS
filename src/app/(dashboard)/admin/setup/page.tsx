"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { useCrud } from "@/hooks/use-crud"
import { RoleGuard } from "@/components/auth/role-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const STEPS = ["University", "Campuses", "Faculties", "Departments", "Programs", "Semesters"]

export default function SetupWizardPage() {
  return (
    <RoleGuard allow={["super_admin", "admin"]}>
      <SetupWizardContent />
    </RoleGuard>
  )
}

function SetupWizardContent() {
  const router = useRouter()
  const { data: user } = useUser()
  const queryClient = useQueryClient()
  const [step, setStep] = React.useState(0)

  const resolvedUniversityId =
    user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const [universityId, setUniversityId] = React.useState<string | null>(resolvedUniversityId)

  React.useEffect(() => {
    if (resolvedUniversityId) setUniversityId(resolvedUniversityId)
  }, [resolvedUniversityId])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">University setup</h1>
        <p className="text-sm text-muted-foreground">
          Set up your institution&apos;s structure, step by step.
        </p>
      </div>

      <div className="space-y-2">
        <Progress value={((step + 1) / STEPS.length) * 100} />
        <div className="flex justify-between text-xs text-muted-foreground">
          {STEPS.map((s, i) => (
            <span key={s} className={cn(i === step && "font-medium text-foreground")}>
              {i + 1}. {s}
            </span>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Step {step + 1}: {STEPS[step]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {step === 0 && (
            <UniversityStep
              universityId={universityId}
              onDone={(id) => {
                setUniversityId(id)
                queryClient.invalidateQueries()
                setStep(1)
              }}
            />
          )}
          {step === 1 && universityId && (
            <CampusesStep universityId={universityId} onNext={() => setStep(2)} />
          )}
          {step === 2 && universityId && (
            <FacultiesStep universityId={universityId} onNext={() => setStep(3)} />
          )}
          {step === 3 && universityId && (
            <DepartmentsStep universityId={universityId} onNext={() => setStep(4)} />
          )}
          {step === 4 && universityId && (
            <ProgramsStep universityId={universityId} onNext={() => setStep(5)} />
          )}
          {step === 5 && universityId && (
            <SemestersStep
              universityId={universityId}
              onFinish={() => {
                toast.success("Setup complete")
                router.push("/admin/hierarchy")
              }}
            />
          )}
        </CardContent>
      </Card>

      {step > 0 && (
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Back
        </Button>
      )}
    </div>
  )
}

// ---- Step 1: University info -------------------------------------------

const universitySchema = z.object({
  name: z.string().min(2, "Required"),
  code: z.string().min(1, "Required"),
  short_name: z.string().optional(),
  timezone: z.string().min(1, "Required"),
  currency: z.string().min(1, "Required"),
})

function UniversityStep({
  universityId,
  onDone,
}: {
  universityId: string | null
  onDone: (id: string) => void
}) {
  const form = useForm<z.infer<typeof universitySchema>>({
    resolver: zodResolver(universitySchema),
    defaultValues: { name: "", code: "", short_name: "", timezone: "UTC", currency: "USD" },
  })

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof universitySchema>) => {
      const supabase = createClient()
      const { name, code, short_name, timezone, currency } = values
      const settings = { timezone, currency }

      if (universityId) {
        const { error } = await supabase
          .from("universities")
          .update({ name, code, short_name, settings })
          .eq("id", universityId)
        if (error) throw error
        return universityId
      }

      const { data, error } = await supabase
        .from("universities")
        .insert({ name, code, short_name, settings })
        .select("id")
        .single()
      if (error) throw error

      // Grant the creator admin access to the new university.
      await supabase.from("user_roles").insert({
        user_id: (await supabase.auth.getUser()).data.user!.id,
        role: "admin",
        university_id: data.id,
      })

      return data.id
    },
    onSuccess: (id) => onDone(id),
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="grid gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>University name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Code</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="short_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Short name</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="timezone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Timezone</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Asia/Karachi" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Currency</FormLabel>
              <FormControl>
                <Input placeholder="e.g. USD" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={mutation.isPending}>
          Save & continue
        </Button>
      </form>
    </Form>
  )
}

// ---- Shared inline list+add step for campuses/faculties/departments/programs

function InlineListStep<T extends { id: string }>({
  items,
  isLoading,
  renderLabel,
  onNext,
  nextLabel = "Continue",
  addForm,
}: {
  items: T[]
  isLoading: boolean
  renderLabel: (item: T) => React.ReactNode
  onNext: () => void
  nextLabel?: string
  addForm: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <Check className="size-4 text-primary" />
              {renderLabel(item)}
            </li>
          ))}
        </ul>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {addForm}
      <div className="flex justify-end">
        <Button onClick={onNext} disabled={items.length === 0}>
          {nextLabel}
        </Button>
      </div>
    </div>
  )
}

function CampusesStep({ universityId, onNext }: { universityId: string; onNext: () => void }) {
  const { list, create } = useCrud("campuses", universityId)
  const form = useForm({ defaultValues: { name: "", code: "" } })

  return (
    <InlineListStep
      items={list.data ?? []}
      isLoading={list.isLoading}
      renderLabel={(c) => `${c.name} (${c.code})`}
      onNext={onNext}
      addForm={
        <form
          className="flex gap-2"
          onSubmit={form.handleSubmit(async (v) => {
            if (!v.name || !v.code) return
            await create.mutateAsync({ ...v, university_id: universityId })
            form.reset()
          })}
        >
          <Input placeholder="Campus name" {...form.register("name")} />
          <Input placeholder="Code" className="w-24" {...form.register("code")} />
          <Button type="submit" variant="outline">
            Add
          </Button>
        </form>
      }
    />
  )
}

function FacultiesStep({ universityId, onNext }: { universityId: string; onNext: () => void }) {
  const { list, create } = useCrud("faculties", universityId)
  const { list: campuses } = useCrud("campuses", universityId)
  const form = useForm({ defaultValues: { name: "", code: "", campus_id: "" } })

  return (
    <InlineListStep
      items={list.data ?? []}
      isLoading={list.isLoading}
      renderLabel={(f) => `${f.name} (${f.code})`}
      onNext={onNext}
      addForm={
        <form
          className="grid gap-2 sm:grid-cols-[1fr_100px_1fr_auto]"
          onSubmit={form.handleSubmit(async (v) => {
            if (!v.name || !v.code) return
            await create.mutateAsync({
              ...v,
              campus_id: v.campus_id || null,
              university_id: universityId,
            })
            form.reset()
          })}
        >
          <Input placeholder="Faculty name" {...form.register("name")} />
          <Input placeholder="Code" {...form.register("code")} />
          <Select
            value={form.watch("campus_id")}
            onValueChange={(v) => form.setValue("campus_id", v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Campus (optional)" />
            </SelectTrigger>
            <SelectContent>
              {(campuses.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="outline">
            Add
          </Button>
        </form>
      }
    />
  )
}

function DepartmentsStep({ universityId, onNext }: { universityId: string; onNext: () => void }) {
  const { list, create } = useCrud("departments", universityId)
  const { list: faculties } = useCrud("faculties", universityId)
  const form = useForm({ defaultValues: { name: "", code: "", faculty_id: "" } })

  return (
    <InlineListStep
      items={list.data ?? []}
      isLoading={list.isLoading}
      renderLabel={(d) => `${d.name} (${d.code})`}
      onNext={onNext}
      addForm={
        <form
          className="grid gap-2 sm:grid-cols-[1fr_100px_1fr_auto]"
          onSubmit={form.handleSubmit(async (v) => {
            if (!v.name || !v.code || !v.faculty_id) return
            await create.mutateAsync({ ...v, university_id: universityId })
            form.reset()
          })}
        >
          <Input placeholder="Department name" {...form.register("name")} />
          <Input placeholder="Code" {...form.register("code")} />
          <Select
            value={form.watch("faculty_id")}
            onValueChange={(v) => form.setValue("faculty_id", v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Faculty" />
            </SelectTrigger>
            <SelectContent>
              {(faculties.data ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="outline">
            Add
          </Button>
        </form>
      }
    />
  )
}

function ProgramsStep({ universityId, onNext }: { universityId: string; onNext: () => void }) {
  const { list, create } = useCrud("programs", universityId)
  const { list: departments } = useCrud("departments", universityId)
  const form = useForm({
    defaultValues: {
      name: "",
      code: "",
      department_id: "",
      degree_level: "bachelor",
      duration_years: "4",
      total_credit_hours: "120",
    },
  })

  return (
    <InlineListStep
      items={list.data ?? []}
      isLoading={list.isLoading}
      renderLabel={(p) => `${p.name} (${p.degree_level})`}
      onNext={onNext}
      addForm={
        <form
          className="grid gap-2"
          onSubmit={form.handleSubmit(async (v) => {
            if (!v.name || !v.code || !v.department_id) return
            await create.mutateAsync({
              name: v.name,
              code: v.code,
              department_id: v.department_id,
              degree_level: v.degree_level as never,
              duration_years: Number(v.duration_years),
              total_credit_hours: Number(v.total_credit_hours),
              university_id: universityId,
            })
            form.reset()
          })}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Program name" {...form.register("name")} />
            <Input placeholder="Code" {...form.register("code")} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Select
              value={form.watch("department_id")}
              onValueChange={(v) => form.setValue("department_id", v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                {(departments.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Duration (yrs)" {...form.register("duration_years")} />
            <Input placeholder="Credit hours" {...form.register("total_credit_hours")} />
          </div>
          <Button type="submit" variant="outline">
            Add program
          </Button>
        </form>
      }
    />
  )
}

function SemestersStep({
  universityId,
  onFinish,
}: {
  universityId: string
  onFinish: () => void
}) {
  const { list, create } = useCrud("semesters", universityId)
  const form = useForm({
    defaultValues: { name: "", code: "", academic_year: "", start_date: "", end_date: "" },
  })

  return (
    <InlineListStep
      items={list.data ?? []}
      isLoading={list.isLoading}
      renderLabel={(s) => `${s.name} — ${s.academic_year}`}
      onNext={onFinish}
      nextLabel="Finish setup"
      addForm={
        <form
          className="grid gap-2"
          onSubmit={form.handleSubmit(async (v) => {
            if (!v.name || !v.code || !v.academic_year || !v.start_date || !v.end_date) return
            await create.mutateAsync({ ...v, university_id: universityId })
            form.reset()
          })}
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Input placeholder="Semester name" {...form.register("name")} />
            <Input placeholder="Code" {...form.register("code")} />
            <Input placeholder="Academic year" {...form.register("academic_year")} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input type="date" {...form.register("start_date")} />
            <Input type="date" {...form.register("end_date")} />
          </div>
          <Button type="submit" variant="outline">
            Add semester
          </Button>
        </form>
      }
    />
  )
}
