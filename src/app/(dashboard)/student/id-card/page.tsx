"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useQuery } from "@tanstack/react-query"
import QRCode from "qrcode"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { useCrud } from "@/hooks/use-crud"
import { RoleGuard } from "@/components/auth/role-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { StudentIdCardData } from "@/components/pdf/student-id-card"

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  { ssr: false, loading: () => <Skeleton className="h-9 w-40" /> }
)
const StudentIdCardDocument = dynamic(
  () => import("@/components/pdf/student-id-card").then((m) => m.StudentIdCardDocument),
  { ssr: false }
)

function useIdCardData(studentId: string | undefined) {
  return useQuery({
    queryKey: ["id-card-data", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const supabase = createClient()
      const { data: student, error } = await supabase
        .from("students")
        .select("*")
        .eq("id", studentId!)
        .single()
      if (error) throw error

      const { data: university } = await supabase
        .from("universities")
        .select("name, logo_url")
        .eq("id", student.university_id)
        .single()

      const qrDataUrl = await QRCode.toDataURL(
        `${window.location.origin}/verify/student/${studentId}`,
        { margin: 1, width: 200 }
      )

      return { student, university, qrDataUrl }
    },
  })
}

export default function StudentIdCardPage() {
  return (
    <RoleGuard allow={["student"]}>
      <StudentIdCardContent />
    </RoleGuard>
  )
}

function StudentIdCardContent() {
  const { data: user } = useUser()
  const { data, isLoading } = useIdCardData(user?.id)
  const { list: programs } = useCrud("programs", data?.student.university_id ?? null)

  const cardData: StudentIdCardData | null = data
    ? {
        universityName: data.university?.name ?? "University",
        logoUrl: data.university?.logo_url ?? undefined,
        studentName: user?.profile?.full_name ?? "",
        studentNumber: data.student.student_number,
        programName:
          programs.data?.find((p) => p.id === data.student.program_id)?.name ?? "",
        validThrough: data.student.expected_graduation_date ?? "—",
        qrDataUrl: data.qrDataUrl,
      }
    : null

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Student ID card</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your digital ID</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !cardData ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="rounded-lg border p-4 text-sm">
                <p className="font-medium">{cardData.studentName}</p>
                <p className="text-muted-foreground">{cardData.studentNumber}</p>
                <p className="text-muted-foreground">{cardData.programName}</p>
              </div>
              <PDFDownloadLink
                document={<StudentIdCardDocument data={cardData} />}
                fileName={`id-card-${cardData.studentNumber}.pdf`}
              >
                {({ loading }: { loading: boolean }) => (
                  <Button disabled={loading}>
                    {loading ? "Preparing..." : "Download ID card (PDF)"}
                  </Button>
                )}
              </PDFDownloadLink>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
