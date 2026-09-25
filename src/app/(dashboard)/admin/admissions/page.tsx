"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { getDocumentSignedUrl } from "@/lib/supabase/storage"
import { useUser } from "@/hooks/use-user"
import { useCrud } from "@/hooks/use-crud"
import { RoleGuard } from "@/components/auth/role-guard"
import { DataTable } from "@/components/crud/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ApplicationStatus, Database } from "@/types/database"
import { Skeleton } from "@/components/ui/skeleton"
import type { OfferLetterData } from "@/components/pdf/offer-letter"

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  { ssr: false, loading: () => <Skeleton className="h-9 w-40" /> }
)
const OfferLetterDocument = dynamic(
  () => import("@/components/pdf/offer-letter").then((m) => m.OfferLetterDocument),
  { ssr: false }
)

type Application = Database["public"]["Tables"]["applications"]["Row"]

const STATUSES: ApplicationStatus[] = [
  "submitted",
  "under_review",
  "shortlisted",
  "accepted",
  "rejected",
  "waitlisted",
]

function useApplications(universityId: string | null) {
  return useQuery({
    queryKey: ["admissions-applications", universityId],
    enabled: !!universityId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .eq("university_id", universityId!)
        .neq("status", "draft")
        .order("submitted_at", { ascending: false })
      if (error) throw error
      return data
    },
  })
}

function useApplicationDocuments(applicationId: string | null) {
  return useQuery({
    queryKey: ["application-documents", applicationId],
    enabled: !!applicationId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("application_documents")
        .select("*")
        .eq("application_id", applicationId!)
      if (error) throw error
      return data
    },
  })
}

export default function AdmissionsDashboardPage() {
  return (
    <RoleGuard allow={["super_admin", "admin", "registrar"]}>
      <AdmissionsDashboardContent />
    </RoleGuard>
  )
}

function AdmissionsDashboardContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const applications = useApplications(universityId)
  const { list: programs } = useCrud("programs", universityId)
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [selected, setSelected] = React.useState<Application | null>(null)

  const filtered = (applications.data ?? []).filter(
    (a) => statusFilter === "all" || a.status === statusFilter
  )

  const programName = (id: string) => programs.data?.find((p) => p.id === id)?.name ?? "—"

  async function updateStatus(id: string, status: ApplicationStatus) {
    const supabase = createClient()
    const { data: application, error } = await supabase
      .from("applications")
      .update({ status })
      .eq("id", id)
      .select("applicant_id, application_number")
      .single()
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(`Marked ${status}`)

    if (universityId && application) {
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: application.applicant_id,
          universityId,
          title: `Application ${status.replace("_", " ")}`,
          body: `Your application ${application.application_number} is now ${status.replace("_", " ")}.`,
          emailSubject: `Application update: ${status.replace("_", " ")}`,
        }),
      }).catch(() => {})
    }
    queryClient.invalidateQueries({ queryKey: ["admissions-applications", universityId] })
    setSelected((s) => (s ? { ...s, status } : s))
  }

  const columns: ColumnDef<Application, unknown>[] = [
    { accessorKey: "application_number", header: "Application #" },
    { id: "program", header: "Program", cell: ({ row }) => programName(row.original.program_id) },
    { accessorKey: "submitted_at", header: "Submitted" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button variant="outline" size="sm" onClick={() => setSelected(row.original)}>
          Review
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admissions</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} applications</p>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={filtered} isLoading={applications.isLoading} searchPlaceholder="Search applications..." />

      <ApplicationReviewSheet
        application={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onUpdateStatus={updateStatus}
        programName={programName}
      />
    </div>
  )
}

function ApplicationReviewSheet({
  application,
  onOpenChange,
  onUpdateStatus,
  programName,
}: {
  application: Application | null
  onOpenChange: (open: boolean) => void
  onUpdateStatus: (id: string, status: ApplicationStatus) => void
  programName: (id: string) => string
}) {
  const documents = useApplicationDocuments(application?.id ?? null)
  const queryClient = useQueryClient()
  const [enrolling, setEnrolling] = React.useState(false)

  const { data: letterInfo } = useQuery({
    queryKey: ["offer-letter-info", application?.id],
    enabled: !!application,
    queryFn: async () => {
      const supabase = createClient()
      const [{ data: applicant }, { data: university }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", application!.applicant_id).single(),
        supabase.from("universities").select("name, logo_url").eq("id", application!.university_id).single(),
      ])
      return { applicant, university }
    },
  })

  async function toggleVerified(docId: string, verified: boolean) {
    const supabase = createClient()
    await supabase.from("application_documents").update({ verified }).eq("id", docId)
    queryClient.invalidateQueries({ queryKey: ["application-documents", application?.id] })
  }

  async function viewDocument(path: string) {
    try {
      const url = await getDocumentSignedUrl(path)
      window.open(url, "_blank")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open document")
    }
  }

  async function enroll() {
    if (!application) return
    setEnrolling(true)
    const res = await fetch("/api/admissions/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: application.id }),
    })
    const body = await res.json()
    setEnrolling(false)
    if (!res.ok) {
      toast.error(body.error ?? "Enrollment failed")
      return
    }
    toast.success(`Enrolled — student number ${body.studentNumber}`)
    queryClient.invalidateQueries()
  }

  return (
    <Sheet open={!!application} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-md">
        {application && (
          <>
            <SheetHeader>
              <SheetTitle>{application.application_number}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-4">
              <p className="text-sm">
                Program: <span className="font-medium">{programName(application.program_id)}</span>
              </p>
              <p className="text-sm">
                Status: <Badge variant="outline">{application.status}</Badge>
              </p>

              <div>
                <p className="mb-2 text-sm font-medium">Documents</p>
                {documents.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : (documents.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents uploaded.</p>
                ) : (
                  <ul className="space-y-2">
                    {documents.data!.map((d) => (
                      <li key={d.id} className="flex items-center justify-between text-sm">
                        <button
                          className="text-left hover:underline"
                          onClick={() => viewDocument(d.file_path)}
                        >
                          {d.file_name}
                        </button>
                        <Button
                          variant={d.verified ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleVerified(d.id, !d.verified)}
                        >
                          {d.verified ? "Verified" : "Verify"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Decision</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onUpdateStatus(application.id, "under_review")}>
                    Mark under review
                  </Button>
                  <Button size="sm" onClick={() => onUpdateStatus(application.id, "shortlisted")}>
                    Shortlist
                  </Button>
                  <Button size="sm" onClick={() => onUpdateStatus(application.id, "accepted")}>
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onUpdateStatus(application.id, "rejected")}
                  >
                    Reject
                  </Button>
                </div>
              </div>

              {application.status === "accepted" && letterInfo && (
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-medium">Enrollment</p>
                  <div className="flex flex-wrap gap-2">
                    <PDFDownloadLink
                      document={
                        <OfferLetterDocument
                          data={
                            {
                              universityName: letterInfo.university?.name ?? "University",
                              logoUrl: letterInfo.university?.logo_url ?? undefined,
                              applicantName: letterInfo.applicant?.full_name ?? "Applicant",
                              programName: programName(application.program_id),
                              applicationNumber: application.application_number,
                              date: new Date().toLocaleDateString(),
                            } satisfies OfferLetterData
                          }
                        />
                      }
                      fileName={`offer-letter-${application.application_number}.pdf`}
                    >
                      {({ loading }: { loading: boolean }) => (
                        <Button size="sm" variant="outline" disabled={loading}>
                          {loading ? "Preparing..." : "Download offer letter"}
                        </Button>
                      )}
                    </PDFDownloadLink>
                    <Button size="sm" onClick={enroll} disabled={enrolling}>
                      {enrolling ? "Enrolling..." : "Enroll student"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
