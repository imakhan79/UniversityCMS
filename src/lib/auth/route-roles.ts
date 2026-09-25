import type { AppRole } from "@/types/database"

// Maps a top-level segment under the (dashboard) route group to the roles
// allowed to enter it. Checked by middleware; a route with no entry here is
// reachable by any authenticated university member.
export const ROUTE_ROLE_MAP: Record<string, AppRole[]> = {
  admin: ["super_admin", "admin", "registrar"],
  student: ["student"],
  faculty: ["faculty"],
  dean: ["dean"],
  hod: ["hod"],
  finance: ["finance", "admin", "super_admin"],
  hr: ["hr", "admin", "super_admin"],
  library: ["librarian", "admin", "super_admin"],
  parent: ["parent"],
  alumni: ["alumni"],
}

export function rolesAllowedForPath(pathname: string): AppRole[] | null {
  const segment = pathname.split("/").filter(Boolean)[0]
  if (!segment) return null
  return ROUTE_ROLE_MAP[segment] ?? null
}
