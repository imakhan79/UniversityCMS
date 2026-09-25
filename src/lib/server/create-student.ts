import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient as createServerClient } from "@/lib/supabase/server"

export interface CreateStudentInput {
  email: string
  full_name: string
  university_id: string
  program_id: string
  student_number: string
  campus_id?: string | null
  enrollment_date?: string
}

// Verifies the caller is an admin/registrar of the target university, then
// invites the student by email (they set their own password via the invite
// link) and creates their student record. Throws on any failure — callers
// (route handlers) turn that into an HTTP error response.
export async function createStudent(input: CreateStudentInput) {
  const supabase = await createServerClient()
  const {
    data: { user: caller },
  } = await supabase.auth.getUser()

  if (!caller) {
    throw new Error("Not authenticated")
  }

  const { data: callerRoles } = await supabase
    .from("user_roles")
    .select("role, university_id")
    .eq("user_id", caller.id)
    .eq("is_active", true)

  const isAuthorized = (callerRoles ?? []).some(
    (r) =>
      r.role === "super_admin" ||
      ((r.role === "admin" || r.role === "registrar") && r.university_id === input.university_id)
  )

  if (!isAuthorized) {
    throw new Error("Not authorized to add students to this university")
  }

  const admin = createAdminClient()

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    input.email,
    { data: { full_name: input.full_name } }
  )
  if (inviteError) throw new Error(inviteError.message)

  const userId = invited.user.id

  const { error: roleError } = await admin.from("user_roles").insert({
    user_id: userId,
    role: "student",
    university_id: input.university_id,
    granted_by: caller.id,
  })
  if (roleError) throw new Error(roleError.message)

  const { error: studentError } = await admin.from("students").insert({
    id: userId,
    university_id: input.university_id,
    program_id: input.program_id,
    student_number: input.student_number,
    campus_id: input.campus_id ?? null,
    enrollment_date: input.enrollment_date ?? new Date().toISOString().slice(0, 10),
  })
  if (studentError) throw new Error(studentError.message)

  return { id: userId }
}
