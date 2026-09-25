"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Trash2, Plus, Upload } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { uploadDocument } from "@/lib/supabase/storage"
import { useUser } from "@/hooks/use-user"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

interface EducationEntry {
  institution: string
  qualification: string
  year: string
  grade: string
}

function generateApplicationNumber() {
  return `APP-${Date.now().toString(36).toUpperCase()}`
}

function useApplication(universityId: string | undefined, programId: string, applicantId: string | undefined) {
  return useQuery({
    queryKey: ["my-application", programId, applicantId],
    enabled: !!applicantId && !!universityId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .eq("applicant_id", applicantId!)
        .eq("program_id", programId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export default function ApplyPage() {
  const params = useParams<{ programId: string }>()
  const router = useRouter()
  const { data: user, isLoading: userLoading } = useUser()
  const queryClient = useQueryClient()

  const { data: program } = useQuery({
    queryKey: ["admissions-program", params.programId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase.from("programs").select("*").eq("id", params.programId).single()
      return data
    },
  })

  const { data: application, isLoading: appLoading } = useApplication(
    program?.university_id,
    params.programId,
    user?.id
  )

  const [education, setEducation] = React.useState<EducationEntry[]>([
    { institution: "", qualification: "", year: "", grade: "" },
  ])
  const [personal, setPersonal] = React.useState({ phone: "", address: "" })
  const [documents, setDocuments] = React.useState<{ name: string; path: string }[]>([])
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (application) {
      if (Array.isArray(application.previous_education) && application.previous_education.length) {
        setEducation(application.previous_education as EducationEntry[])
      }
      const details = application.personal_details as { phone?: string; address?: string }
      setPersonal({ phone: details.phone ?? "", address: details.address ?? "" })
    }
  }, [application])

  if (userLoading || appLoading) return <Skeleton className="h-96 w-full" />

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in to apply</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Create an account or sign in to start your application to {program?.name}.
          </p>
          <div className="flex gap-2">
            <Button render={<Link href={`/register?redirectTo=/admissions/apply/${params.programId}`} />}>
              Create account
            </Button>
            <Button
              variant="outline"
              render={<Link href={`/login?redirectTo=/admissions/apply/${params.programId}`} />}
            >
              Sign in
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const isSubmitted = application && application.status !== "draft"

  async function saveDraft() {
    if (!program || !user) return
    setSaving(true)
    const supabase = createClient()

    const payload = {
      university_id: program.university_id,
      applicant_id: user.id,
      program_id: program.id,
      application_number: application?.application_number ?? generateApplicationNumber(),
      status: "draft" as const,
      previous_education: education,
      personal_details: personal,
    }

    const { error } = application
      ? await supabase.from("applications").update(payload).eq("id", application.id)
      : await supabase.from("applications").insert(payload)

    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Draft saved")
    queryClient.invalidateQueries({ queryKey: ["my-application", params.programId, user.id] })
  }

  async function handleUpload(file: File) {
    if (!application || !user) {
      toast.error("Save your details first")
      return
    }
    try {
      const path = await uploadDocument(application.university_id, user.id, file)
      const supabase = createClient()
      const { error } = await supabase.from("application_documents").insert({
        university_id: application.university_id,
        application_id: application.id,
        document_type: "other",
        file_path: path,
        file_name: file.name,
      })
      if (error) throw error
      setDocuments((d) => [...d, { name: file.name, path }])
      toast.success("Document uploaded")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    }
  }

  async function submitApplication() {
    if (!application) {
      toast.error("Save your details first")
      return
    }
    const res = await fetch("/api/admissions/pay-and-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: application.id }),
    })
    const body = await res.json()
    if (!res.ok) {
      toast.error(body.error ?? "Could not start application fee payment")
      return
    }
    if (body.url) {
      window.location.href = body.url
    } else {
      router.push("/admissions/apply/thank-you")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Apply to {program?.name}</h1>
        {application && (
          <p className="text-sm text-muted-foreground">
            Application #{application.application_number} —{" "}
            <Badge variant="outline">{application.status}</Badge>
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Phone</Label>
            <Input
              value={personal.phone}
              disabled={!!isSubmitted}
              onChange={(e) => setPersonal((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Address</Label>
            <Input
              value={personal.address}
              disabled={!!isSubmitted}
              onChange={(e) => setPersonal((p) => ({ ...p, address: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Previous education</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {education.map((e, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_100px_100px_auto]">
              <Input
                placeholder="Institution"
                value={e.institution}
                disabled={!!isSubmitted}
                onChange={(ev) =>
                  setEducation((list) =>
                    list.map((item, idx) => (idx === i ? { ...item, institution: ev.target.value } : item))
                  )
                }
              />
              <Input
                placeholder="Qualification"
                value={e.qualification}
                disabled={!!isSubmitted}
                onChange={(ev) =>
                  setEducation((list) =>
                    list.map((item, idx) => (idx === i ? { ...item, qualification: ev.target.value } : item))
                  )
                }
              />
              <Input
                placeholder="Year"
                value={e.year}
                disabled={!!isSubmitted}
                onChange={(ev) =>
                  setEducation((list) =>
                    list.map((item, idx) => (idx === i ? { ...item, year: ev.target.value } : item))
                  )
                }
              />
              <Input
                placeholder="Grade"
                value={e.grade}
                disabled={!!isSubmitted}
                onChange={(ev) =>
                  setEducation((list) =>
                    list.map((item, idx) => (idx === i ? { ...item, grade: ev.target.value } : item))
                  )
                }
              />
              {!isSubmitted && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEducation((list) => list.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {!isSubmitted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setEducation((list) => [...list, { institution: "", qualification: "", year: "", grade: "" }])
              }
            >
              <Plus className="size-4" /> Add another
            </Button>
          )}
        </CardContent>
      </Card>

      {!isSubmitted && (
        <Button variant="outline" onClick={saveDraft} disabled={saving}>
          Save draft
        </Button>
      )}

      {application && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1 text-sm">
              {documents.map((d, i) => (
                <li key={i}>{d.name}</li>
              ))}
            </ul>
            {!isSubmitted && (
              <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                <Upload className="size-4" /> Upload document
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                />
              </label>
            )}
          </CardContent>
        </Card>
      )}

      {application && !isSubmitted && (
        <Button size="lg" onClick={submitApplication}>
          Pay application fee & submit
        </Button>
      )}
    </div>
  )
}
