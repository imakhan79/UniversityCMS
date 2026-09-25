// Hand-written subset of the generated Supabase types, covering only what
// the auth/RBAC layer needs (profiles, user_roles, universities).
//
// Once the project is linked via the Supabase CLI, replace this file with
// the full generated types:
//   supabase gen types typescript --project-id nrrcizmrrlgrfraqrddy > src/types/database.ts

export type AppRole =
  | "super_admin"
  | "admin"
  | "registrar"
  | "dean"
  | "hod"
  | "faculty"
  | "student"
  | "parent"
  | "alumni"
  | "finance"
  | "hr"
  | "librarian"

// Matches postgrest-js's GenericTable constraint (Row/Insert/Update/Relationships).
interface Table<Row, Insert, Update = Partial<Insert>> {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

type UniversityRow = {
  id: string
  name: string
  short_name: string | null
  code: string
  domain: string | null
  logo_url: string | null
  is_active: boolean
  settings: Record<string, unknown>
}

type ProfileRow = {
  id: string
  primary_university_id: string | null
  full_name: string
  avatar_url: string | null
  phone: string | null
  address: string | null
  city: string | null
  country: string | null
  date_of_birth: string | null
  gender: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

type UserRoleRow = {
  id: string
  user_id: string
  role: AppRole
  university_id: string | null
  is_active: boolean
  granted_by: string | null
  granted_at: string
  expires_at: string | null
}

export type DegreeLevel =
  | "certificate"
  | "diploma"
  | "associate"
  | "bachelor"
  | "master"
  | "phd"
  | "postdoc"

type Audited = {
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

type CampusRow = {
  id: string
  university_id: string
  name: string
  code: string
  address: string | null
  city: string | null
  country: string | null
  is_main: boolean
  is_active: boolean
} & Audited

type FacultyRow = {
  id: string
  university_id: string
  campus_id: string | null
  name: string
  code: string
  dean_id: string | null
  is_active: boolean
} & Audited

type DepartmentRow = {
  id: string
  university_id: string
  faculty_id: string
  name: string
  code: string
  hod_id: string | null
  is_active: boolean
} & Audited

type ProgramRow = {
  id: string
  university_id: string
  department_id: string
  name: string
  code: string
  degree_level: DegreeLevel
  duration_years: number
  total_credit_hours: number
  is_active: boolean
} & Audited

type SemesterRow = {
  id: string
  university_id: string
  name: string
  code: string
  academic_year: string
  start_date: string
  end_date: string
  registration_start: string | null
  registration_end: string | null
  is_current: boolean
} & Audited

type CourseRow = {
  id: string
  university_id: string
  department_id: string
  code: string
  title: string
  description: string | null
  credit_hours: number
  level: number | null
  is_active: boolean
} & Audited

type NotificationRow = {
  id: string
  university_id: string
  recipient_id: string
  type: "info" | "warning" | "success" | "error" | "academic" | "financial" | "system"
  title: string
  body: string | null
  link: string | null
  is_read: boolean
  read_at: string | null
} & Audited

type StudentRow = {
  id: string
  university_id: string
  student_number: string
  program_id: string
  campus_id: string | null
  advisor_id: string | null
  current_semester_id: string | null
  status: "active" | "on_leave" | "suspended" | "graduated" | "withdrawn" | "dismissed" | "deferred"
  enrollment_date: string
  expected_graduation_date: string | null
  actual_graduation_date: string | null
  cumulative_gpa: number
  total_credits_earned: number
} & Audited

// Minimal stubs (id/aggregation columns only) for KPI dashboard queries —
// widen these once the project is linked and full types are generated.
type EmployeeRow = { id: string; university_id: string; employment_status: string }
type FeeInvoiceRow = {
  id: string
  university_id: string
  student_id: string
  semester_id: string | null
  invoice_number: string
  amount_due: number
  amount_paid: number
  due_date: string | null
  status: string
}
type AttendanceRow = {
  id: string
  university_id: string
  student_id: string
  course_offering_id: string
  session_date: string
  status: string
}
type ResultRow = { id: string; university_id: string; status: string; published: boolean }

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "shortlisted"
  | "accepted"
  | "rejected"
  | "waitlisted"
  | "withdrawn"
  | "enrolled"

type ApplicationRow = {
  id: string
  university_id: string
  applicant_id: string
  program_id: string
  application_number: string
  intake_semester_id: string | null
  status: ApplicationStatus
  previous_education: unknown[]
  personal_details: Record<string, unknown>
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  decision_notes: string | null
} & Audited

type ApplicationDocumentRow = {
  id: string
  university_id: string
  application_id: string
  document_type: string
  file_path: string
  file_name: string
  verified: boolean
} & Audited

type EntryTestRow = {
  id: string
  university_id: string
  program_id: string | null
  name: string
  test_date: string | null
  total_marks: number
  passing_marks: number | null
  is_active: boolean
} & Audited

type EntryTestResultRow = {
  id: string
  university_id: string
  entry_test_id: string
  application_id: string
  marks_obtained: number | null
  percentile: number | null
  passed: boolean | null
} & Audited

type MeritListRow = {
  id: string
  university_id: string
  program_id: string
  intake_semester_id: string | null
  name: string
  is_final: boolean
  published_at: string | null
  published_by: string | null
} & Audited

type MeritListEntryRow = {
  id: string
  university_id: string
  merit_list_id: string
  application_id: string
  rank: number
  score: number | null
}

type SeatAllocationRow = {
  id: string
  university_id: string
  application_id: string
  program_id: string
  intake_semester_id: string | null
  seat_category: string
  status: string
  allocated_at: string
} & Audited

type CoursePrerequisiteRow = {
  id: string
  university_id: string
  course_id: string
  prerequisite_course_id: string
}

type CourseOfferingRow = {
  id: string
  university_id: string
  course_id: string
  semester_id: string
  campus_id: string | null
  section_code: string
  instructor_id: string | null
  max_seats: number
  enrolled_count: number
  schedule: { day: string; start: string; end: string }[]
  room: string | null
  mode: string
  status: string
}

type RegistrationRow = {
  id: string
  university_id: string
  student_id: string
  course_offering_id: string
  semester_id: string
  status: string
}

type GradeRow = {
  id: string
  university_id: string
  registration_id: string
  student_id: string
  course_offering_id: string
  marks_obtained: number | null
  letter_grade: string | null
  grade_points: number | null
  is_final: boolean
}

type StudentDocumentRow = {
  id: string
  university_id: string
  student_id: string
  document_type: string
  file_path: string
  file_name: string
  verified: boolean
} & Audited

type PaymentRow = {
  id: string
  university_id: string
  fee_invoice_id: string
  student_id: string
  amount: number
  payment_method: string
  status: string
  paid_at: string
}

export interface Database {
  public: {
    Tables: {
      universities: Table<UniversityRow, Partial<UniversityRow> & { name: string; code: string }>
      profiles: Table<ProfileRow, Partial<ProfileRow> & { id: string; full_name: string }>
      user_roles: Table<UserRoleRow, Partial<UserRoleRow> & { user_id: string; role: AppRole }>
      campuses: Table<CampusRow, Partial<CampusRow> & { university_id: string; name: string; code: string }>
      faculties: Table<FacultyRow, Partial<FacultyRow> & { university_id: string; name: string; code: string }>
      departments: Table<
        DepartmentRow,
        Partial<DepartmentRow> & { university_id: string; faculty_id: string; name: string; code: string }
      >
      programs: Table<
        ProgramRow,
        Partial<ProgramRow> & {
          university_id: string
          department_id: string
          name: string
          code: string
          degree_level: DegreeLevel
          duration_years: number
          total_credit_hours: number
        }
      >
      semesters: Table<
        SemesterRow,
        Partial<SemesterRow> & {
          university_id: string
          name: string
          code: string
          academic_year: string
          start_date: string
          end_date: string
        }
      >
      courses: Table<
        CourseRow,
        Partial<CourseRow> & {
          university_id: string
          department_id: string
          code: string
          title: string
          credit_hours: number
        }
      >
      notifications: Table<
        NotificationRow,
        Partial<NotificationRow> & { university_id: string; recipient_id: string; title: string }
      >
      students: Table<
        StudentRow,
        Partial<StudentRow> & { id: string; university_id: string; student_number: string; program_id: string }
      >
      employees: Table<EmployeeRow, Partial<EmployeeRow> & { id: string; university_id: string }>
      fee_invoices: Table<
        FeeInvoiceRow,
        Partial<FeeInvoiceRow> & {
          university_id: string
          student_id: string
          invoice_number: string
          amount_due: number
        }
      >
      attendance: Table<
        AttendanceRow,
        Partial<AttendanceRow> & {
          university_id: string
          student_id: string
          course_offering_id: string
          session_date: string
        }
      >
      results: Table<ResultRow, Partial<ResultRow> & { university_id: string }>
      course_offerings: Table<
        CourseOfferingRow,
        Partial<CourseOfferingRow> & { university_id: string; course_id: string; semester_id: string }
      >
      registrations: Table<
        RegistrationRow,
        Partial<RegistrationRow> & {
          university_id: string
          student_id: string
          course_offering_id: string
          semester_id: string
        }
      >
      grades: Table<
        GradeRow,
        Partial<GradeRow> & {
          university_id: string
          registration_id: string
          student_id: string
          course_offering_id: string
        }
      >
      student_documents: Table<
        StudentDocumentRow,
        Partial<StudentDocumentRow> & {
          university_id: string
          student_id: string
          document_type: string
          file_path: string
          file_name: string
        }
      >
      applications: Table<
        ApplicationRow,
        Partial<ApplicationRow> & { university_id: string; applicant_id: string; program_id: string; application_number: string }
      >
      application_documents: Table<
        ApplicationDocumentRow,
        Partial<ApplicationDocumentRow> & {
          university_id: string
          application_id: string
          document_type: string
          file_path: string
          file_name: string
        }
      >
      entry_tests: Table<EntryTestRow, Partial<EntryTestRow> & { university_id: string; name: string }>
      entry_test_results: Table<
        EntryTestResultRow,
        Partial<EntryTestResultRow> & { university_id: string; entry_test_id: string; application_id: string }
      >
      merit_lists: Table<
        MeritListRow,
        Partial<MeritListRow> & { university_id: string; program_id: string; name: string }
      >
      merit_list_entries: Table<
        MeritListEntryRow,
        Partial<MeritListEntryRow> & { university_id: string; merit_list_id: string; application_id: string; rank: number }
      >
      seat_allocations: Table<
        SeatAllocationRow,
        Partial<SeatAllocationRow> & { university_id: string; application_id: string; program_id: string }
      >
      course_prerequisites: Table<
        CoursePrerequisiteRow,
        Partial<CoursePrerequisiteRow> & { university_id: string; course_id: string; prerequisite_course_id: string }
      >
      payments: Table<
        PaymentRow,
        Partial<PaymentRow> & {
          university_id: string
          fee_invoice_id: string
          student_id: string
          amount: number
          payment_method: string
        }
      >
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      app_role: AppRole
    }
  }
}
