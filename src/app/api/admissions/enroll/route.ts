import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient as createServerClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const {
    data: { user: caller },
  } = await supabase.auth.getUser()
  if (!caller) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { applicationId } = (await request.json()) as { applicationId: string }

  const { data: application, error } = await supabase
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .single()
  if (error || !application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }
  if (application.status !== "accepted") {
    return NextResponse.json({ error: "Only accepted applications can be enrolled" }, { status: 400 })
  }

  const { data: callerRoles } = await supabase
    .from("user_roles")
    .select("role, university_id")
    .eq("user_id", caller.id)
    .eq("is_active", true)
  const isAuthorized = (callerRoles ?? []).some(
    (r) =>
      r.role === "super_admin" ||
      ((r.role === "admin" || r.role === "registrar") && r.university_id === application.university_id)
  )
  if (!isAuthorized) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  }

  const admin = createAdminClient()
  const studentNumber = `STU-${new Date().getFullYear()}-${application.application_number.slice(-6)}`

  const { error: roleError } = await admin.from("user_roles").insert({
    user_id: application.applicant_id,
    role: "student",
    university_id: application.university_id,
    granted_by: caller.id,
  })
  if (roleError && !roleError.message.includes("duplicate")) {
    return NextResponse.json({ error: roleError.message }, { status: 500 })
  }

  const { error: studentError } = await admin.from("students").insert({
    id: application.applicant_id,
    university_id: application.university_id,
    program_id: application.program_id,
    student_number: studentNumber,
  })
  if (studentError) {
    return NextResponse.json({ error: studentError.message }, { status: 500 })
  }

  await admin.from("applications").update({ status: "enrolled" }).eq("id", applicationId)
  await admin.from("notifications").insert({
    university_id: application.university_id,
    recipient_id: application.applicant_id,
    type: "success",
    title: "Enrollment confirmed",
    body: `Your student number is ${studentNumber}. Welcome!`,
  })

  return NextResponse.json({ studentNumber })
}
