export interface GradedCourse {
  semesterId: string
  semesterName: string
  courseTitle: string
  courseCode: string
  creditHours: number
  letterGrade: string | null
  gradePoints: number | null
}

export interface SemesterSummary {
  semesterId: string
  semesterName: string
  courses: GradedCourse[]
  creditHours: number
  gpa: number
}

// Weighted-average GPA/CGPA engine: grade_points already reflect the
// letter-grade-to-point mapping applied at grading time (see migration 003
// `grades.grade_points`), so this just does credit-hour-weighted averaging
// — the same formula for a single semester or the whole transcript.
export function weightedGpa(courses: { creditHours: number; gradePoints: number | null }[]): number {
  const graded = courses.filter((c) => c.gradePoints !== null)
  const totalCredits = graded.reduce((sum, c) => sum + c.creditHours, 0)
  if (totalCredits === 0) return 0
  const totalPoints = graded.reduce((sum, c) => sum + c.creditHours * (c.gradePoints ?? 0), 0)
  return Math.round((totalPoints / totalCredits) * 1000) / 1000
}

export function groupBySemester(courses: GradedCourse[]): SemesterSummary[] {
  const bySemester = new Map<string, GradedCourse[]>()
  for (const c of courses) {
    const list = bySemester.get(c.semesterId) ?? []
    list.push(c)
    bySemester.set(c.semesterId, list)
  }

  return Array.from(bySemester.entries()).map(([semesterId, semCourses]) => ({
    semesterId,
    semesterName: semCourses[0]?.semesterName ?? "",
    courses: semCourses,
    creditHours: semCourses.reduce((sum, c) => sum + c.creditHours, 0),
    gpa: weightedGpa(semCourses.map((c) => ({ creditHours: c.creditHours, gradePoints: c.gradePoints }))),
  }))
}

export function gradeDistribution(courses: GradedCourse[]): { grade: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const c of courses) {
    const grade = c.letterGrade ?? "N/A"
    counts.set(grade, (counts.get(grade) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([grade, count]) => ({ grade, count }))
}
