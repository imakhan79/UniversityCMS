"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useQuery } from "@tanstack/react-query"
import QRCode from "qrcode"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { useCrud } from "@/hooks/use-crud"
import { useTranscriptData } from "@/hooks/use-transcript"
import { groupBySemester, weightedGpa } from "@/lib/academics/gpa"
import { RoleGuard } from "@/components/auth/role-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { TranscriptData } from "@/components/pdf/transcript"

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  { ssr: false, loading: () => <Skeleton className="h-9 w-48" /> }
)
const TranscriptDocument = dynamic(
  () => import("@/components/pdf/transcript").then((m) => m.TranscriptDocument),
  { ssr: false }
)

function useQrDataUrl(studentId: string | undefined) {
  return useQuery({
    queryKey: ["transcript-qr", studentId],
    enabled: !!studentId,
    queryFn: () =>
      QRCode.toDataURL(`${window.location.origin}/verify/transcript/${studentId}`, {
        margin: 1,
        width: 200,
      }),
  })
}

export default function StudentTranscriptPage() {
  return (
    <RoleGuard allow={["student"]}>
      <StudentTranscriptContent />
    </RoleGuard>
  )
}

function StudentTranscriptContent() {
  const { data: user } = useUser()
  const { data: courses, isLoading } = useTranscriptData(user?.id)
  const { data: qrDataUrl } = useQrDataUrl(user?.id)
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { list: programs } = useCrud("programs", universityId)

  const { data: universityData } = useQuery({
    queryKey: ["university-letterhead", universityId],
    enabled: !!universityId,
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("universities")
        .select("name, logo_url")
        .eq("id", universityId!)
        .single()
      return data
    },
  })

  const { data: myStudentRow } = useQuery({
    queryKey: ["my-student-row", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("students")
        .select("student_number, program_id")
        .eq("id", user!.id)
        .single()
      return data
    },
  })

  const semesters = courses ? groupBySemester(courses) : []
  const cumulativeGpa = courses
    ? weightedGpa(courses.map((c) => ({ creditHours: c.creditHours, gradePoints: c.gradePoints })))
    : 0
  const totalCredits = semesters.reduce((sum, s) => sum + s.creditHours, 0)

  const programName = programs.data?.find((p) => p.id === myStudentRow?.program_id)?.name ?? ""

  const transcriptData: TranscriptData | null =
    courses && qrDataUrl
      ? {
          universityName: universityData?.name ?? "University",
          logoUrl: universityData?.logo_url ?? undefined,
          studentName: user?.profile?.full_name ?? "",
          studentNumber: myStudentRow?.student_number ?? "",
          programName,
          semesters,
          cumulativeGpa,
          totalCredits,
          isOfficial: false,
          qrDataUrl,
          generatedAt: new Date().toLocaleDateString(),
        }
      : null

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Transcript</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cumulative GPA: {cumulativeGpa.toFixed(3)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : semesters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No final grades recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {semesters.map((s) => (
                <div key={s.semesterId} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{s.semesterName}</p>
                  <p className="text-muted-foreground">
                    {s.courses.length} courses · {s.creditHours} credits · GPA {s.gpa.toFixed(3)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {transcriptData && (
            <PDFDownloadLink
              document={<TranscriptDocument data={transcriptData} />}
              fileName="transcript.pdf"
            >
              {({ loading }: { loading: boolean }) => (
                <Button disabled={loading}>
                  {loading ? "Preparing..." : "Download transcript (PDF)"}
                </Button>
              )}
            </PDFDownloadLink>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
