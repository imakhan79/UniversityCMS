import { NextResponse } from "next/server"

import { createStudent, type CreateStudentInput } from "@/lib/server/create-student"

interface BulkResult {
  email: string
  status: "created" | "error"
  error?: string
}

// CSV bulk import (Step 5): the client parses the CSV into rows and posts
// them here one array — each row is created the same way a single manual
// add would be, so authorization/validation isn't duplicated.
export async function POST(request: Request) {
  const { rows } = (await request.json()) as { rows: CreateStudentInput[] }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 })
  }
  if (rows.length > 500) {
    return NextResponse.json({ error: "Max 500 rows per import" }, { status: 400 })
  }

  const results: BulkResult[] = []

  for (const row of rows) {
    if (!row.email || !row.full_name || !row.university_id || !row.program_id || !row.student_number) {
      results.push({ email: row.email ?? "(missing)", status: "error", error: "Missing required fields" })
      continue
    }
    try {
      await createStudent(row)
      results.push({ email: row.email, status: "created" })
    } catch (error) {
      results.push({
        email: row.email,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  return NextResponse.json({ results })
}
