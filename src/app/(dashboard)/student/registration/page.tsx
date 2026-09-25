"use client"

import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, X, Check } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { findScheduleConflicts } from "@/lib/academics/schedule"
import { RoleGuard } from "@/components/auth/role-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const MIN_CREDIT_HOURS = 12
const MAX_CREDIT_HOURS = 21

function useRegistrationData(studentId: string | undefined, universityId: string | null) {
  return useQuery({
    queryKey: ["registration-data", studentId, universityId],
    enabled: !!studentId && !!universityId,
    queryFn: async () => {
      const supabase = createClient()

      const { data: semester } = await supabase
        .from("semesters")
        .select("*")
        .eq("university_id", universityId!)
        .eq("is_current", true)
        .maybeSingle()

      if (!semester) return { semester: null, offerings: [], courses: [], registrations: [], completedCourseIds: new Set<string>(), prereqs: [] }

      const { data: offerings } = await supabase
        .from("course_offerings")
        .select("*")
        .eq("semester_id", semester.id)
        .in("status", ["scheduled", "open_for_registration"])

      const courseIds = [...new Set((offerings ?? []).map((o) => o.course_id))]
      const { data: courses } = courseIds.length
        ? await supabase.from("courses").select("*").in("id", courseIds)
        : { data: [] }

      const { data: registrations } = await supabase
        .from("registrations")
        .select("*")
        .eq("student_id", studentId!)
        .eq("semester_id", semester.id)

      const { data: finalGrades } = await supabase
        .from("grades")
        .select("course_offering_id, grade_points")
        .eq("student_id", studentId!)
        .eq("is_final", true)

      const passedOfferingIds = new Set(
        (finalGrades ?? []).filter((g) => (g.grade_points ?? 0) > 0).map((g) => g.course_offering_id)
      )
      const { data: allOfferingsForGrades } = passedOfferingIds.size
        ? await supabase.from("course_offerings").select("id, course_id").in("id", [...passedOfferingIds])
        : { data: [] }
      const completedCourseIds = new Set((allOfferingsForGrades ?? []).map((o) => o.course_id))

      const { data: prereqs } = courseIds.length
        ? await supabase.from("course_prerequisites").select("*").in("course_id", courseIds)
        : { data: [] }

      return {
        semester,
        offerings: offerings ?? [],
        courses: courses ?? [],
        registrations: registrations ?? [],
        completedCourseIds,
        prereqs: prereqs ?? [],
      }
    },
  })
}

export default function StudentRegistrationPage() {
  return (
    <RoleGuard allow={["student"]}>
      <StudentRegistrationContent />
    </RoleGuard>
  )
}

function StudentRegistrationContent() {
  const { data: user } = useUser()
  const universityId = user?.profile?.primary_university_id ?? user?.roles[0]?.university_id ?? null
  const { data, isLoading } = useRegistrationData(user?.id, universityId)
  const queryClient = useQueryClient()

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["registration-data", user?.id, universityId] })

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!data?.semester) {
    return <p className="text-sm text-muted-foreground">No open semester for registration right now.</p>
  }

  const { semester, offerings, courses, registrations, completedCourseIds, prereqs } = data

  const courseById = new Map(courses.map((c) => [c.id, c]))
  const cart = registrations.filter((r) => r.status === "pending")
  const confirmed = registrations.filter((r) => r.status === "confirmed")
  const activeOfferingIds = new Set([...cart, ...confirmed].map((r) => r.course_offering_id))

  const activeOfferings = offerings.filter((o) => activeOfferingIds.has(o.id))
  const totalCredits = activeOfferings.reduce(
    (sum, o) => sum + (courseById.get(o.course_id)?.credit_hours ?? 0),
    0
  )

  async function addToCart(offering: (typeof offerings)[number]) {
    const course = courseById.get(offering.course_id)
    if (!course) return

    if (registrations.some((r) => r.course_offering_id === offering.id)) {
      toast.error("Already registered for this offering.")
      return
    }

    // Prerequisites
    const required = prereqs.filter((p) => p.course_id === offering.course_id)
    const missing = required.filter((p) => !completedCourseIds.has(p.prerequisite_course_id))
    if (missing.length > 0) {
      toast.error("Prerequisite not met for this course.")
      return
    }

    // Seat availability
    if (offering.enrolled_count >= offering.max_seats) {
      toast.error("This section is full.")
      return
    }

    // Credit hour limit
    if (totalCredits + course.credit_hours > MAX_CREDIT_HOURS) {
      toast.error(`Adding this course exceeds the ${MAX_CREDIT_HOURS}-credit limit.`)
      return
    }

    // Schedule conflict
    const conflicts = findScheduleConflicts(
      offering.schedule,
      activeOfferings.map((o) => ({ id: o.id, schedule: o.schedule }))
    )
    if (conflicts.length > 0) {
      toast.error("Schedule conflict with another course in your cart.")
      return
    }

    const supabase = createClient()
    const { error } = await supabase.from("registrations").insert({
      university_id: universityId!,
      student_id: user!.id,
      course_offering_id: offering.id,
      semester_id: semester.id,
      status: "pending",
    })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(`Added ${course.code} to cart`)
    invalidate()
  }

  async function removeFromCart(registrationId: string) {
    const supabase = createClient()
    const { error } = await supabase.from("registrations").delete().eq("id", registrationId)
    if (error) {
      toast.error(error.message)
      return
    }
    invalidate()
  }

  async function confirmRegistration() {
    if (totalCredits < MIN_CREDIT_HOURS) {
      toast.error(`You need at least ${MIN_CREDIT_HOURS} credit hours to confirm registration.`)
      return
    }
    const supabase = createClient()
    const { error } = await supabase
      .from("registrations")
      .update({ status: "confirmed" })
      .in(
        "id",
        cart.map((c) => c.id)
      )
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Registration confirmed")
    invalidate()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Course registration</h1>
        <p className="text-sm text-muted-foreground">{semester.name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Cart & confirmed ({totalCredits} / {MAX_CREDIT_HOURS} credit hours, min {MIN_CREDIT_HOURS})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeOfferings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing added yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...cart, ...confirmed].map((r) => {
                  const offering = offerings.find((o) => o.id === r.course_offering_id)
                  const course = offering ? courseById.get(offering.course_id) : null
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        {course?.code} — {course?.title}
                      </TableCell>
                      <TableCell>{offering?.section_code}</TableCell>
                      <TableCell>{course?.credit_hours}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "confirmed" ? "default" : "secondary"}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.status === "pending" && (
                          <Button variant="ghost" size="icon-sm" onClick={() => removeFromCart(r.id)}>
                            <X className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          {cart.length > 0 && (
            <Button className="mt-4" onClick={confirmRegistration}>
              <Check className="size-4" /> Confirm registration
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available offerings</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {offerings
                .filter((o) => !activeOfferingIds.has(o.id))
                .map((o) => {
                  const course = courseById.get(o.course_id)
                  const slot = o.schedule[0]
                  return (
                    <TableRow key={o.id}>
                      <TableCell>
                        {course?.code} — {course?.title} ({course?.credit_hours} cr)
                      </TableCell>
                      <TableCell>{o.section_code}</TableCell>
                      <TableCell>{slot ? `${slot.day} ${slot.start}-${slot.end}` : "—"}</TableCell>
                      <TableCell>
                        {o.enrolled_count}/{o.max_seats}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => addToCart(o)}>
                          <Plus className="size-4" /> Add
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
