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
}

type ProfileRow = {
  id: string
  primary_university_id: string | null
  full_name: string
  avatar_url: string | null
  phone: string | null
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

export interface Database {
  public: {
    Tables: {
      universities: Table<UniversityRow, Partial<UniversityRow> & { name: string; code: string }>
      profiles: Table<ProfileRow, Partial<ProfileRow> & { id: string; full_name: string }>
      user_roles: Table<UserRoleRow, Partial<UserRoleRow> & { user_id: string; role: AppRole }>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      app_role: AppRole
    }
  }
}
