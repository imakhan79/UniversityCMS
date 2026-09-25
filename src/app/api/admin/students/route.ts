import { NextResponse } from "next/server"

import { createStudent, type CreateStudentInput } from "@/lib/server/create-student"

export async function POST(request: Request) {
  const body = (await request.json()) as CreateStudentInput

  if (!body.email || !body.full_name || !body.university_id || !body.program_id || !body.student_number) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  try {
    const result = await createStudent(body)
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create student"
    const status = message.includes("Not authorized") || message.includes("Not authenticated") ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
