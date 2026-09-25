"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { GradedCourse } from "@/lib/academics/gpa"

export function useTranscriptData(studentId: string | undefined) {
  return useQuery({
    queryKey: ["transcript-data", studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<GradedCourse[]> => {
      const supabase = createClient()

      const { data: grades, error } = await supabase
        .from("grades")
        .select("*")
        .eq("student_id", studentId!)
        .eq("is_final", true)
      if (error) throw error
      if (grades.length === 0) return []

      const offeringIds = [...new Set(grades.map((g) => g.course_offering_id))]
      const { data: offerings } = await supabase
        .from("course_offerings")
        .select("id, course_id, semester_id")
        .in("id", offeringIds)

      const courseIds = [...new Set((offerings ?? []).map((o) => o.course_id))]
      const semesterIds = [...new Set((offerings ?? []).map((o) => o.semester_id))]

      const [{ data: courses }, { data: semesters }] = await Promise.all([
        courseIds.length
          ? supabase.from("courses").select("id, title, code, credit_hours").in("id", courseIds)
          : Promise.resolve({ data: [] as { id: string; title: string; code: string; credit_hours: number }[] }),
        semesterIds.length
          ? supabase.from("semesters").select("id, name").in("id", semesterIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ])

      const offeringById = new Map((offerings ?? []).map((o) => [o.id, o]))
      const courseById = new Map((courses ?? []).map((c) => [c.id, c]))
      const semesterById = new Map((semesters ?? []).map((s) => [s.id, s]))

      return grades
        .map((g): GradedCourse | null => {
          const offering = offeringById.get(g.course_offering_id)
          if (!offering) return null
          const course = courseById.get(offering.course_id)
          const semester = semesterById.get(offering.semester_id)
          return {
            semesterId: offering.semester_id,
            semesterName: semester?.name ?? "Unknown semester",
            courseTitle: course?.title ?? "Unknown course",
            courseCode: course?.code ?? "",
            creditHours: course?.credit_hours ?? 0,
            letterGrade: g.letter_grade,
            gradePoints: g.grade_points,
          }
        })
        .filter((g): g is GradedCourse => g !== null)
    },
  })
}
