import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  Building2,
  GraduationCap,
  Users,
  ClipboardList,
  BookOpen,
  Wallet,
  UserCog,
  Home,
  Landmark,
  Network,
  CalendarRange,
  Library,
} from "lucide-react"

import type { AppRole } from "@/types/database"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  roles: AppRole[]
}

export interface NavSection {
  title: string
  items: NavItem[]
}

// Filtered per-viewer by role in <Sidebar>. Each top-level href segment must
// match a key in ROUTE_ROLE_MAP (src/lib/auth/route-roles.ts).
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/admin",
        icon: LayoutDashboard,
        roles: ["super_admin", "admin", "registrar"],
      },
      {
        label: "My Dashboard",
        href: "/student",
        icon: Home,
        roles: ["student"],
      },
      {
        label: "Registration",
        href: "/student/registration",
        icon: BookOpen,
        roles: ["student"],
      },
      {
        label: "Timetable",
        href: "/student/timetable",
        icon: CalendarRange,
        roles: ["student"],
      },
      {
        label: "Results",
        href: "/student/results",
        icon: ClipboardList,
        roles: ["student"],
      },
      {
        label: "Transcript",
        href: "/student/transcript",
        icon: GraduationCap,
        roles: ["student"],
      },
      {
        label: "Fees",
        href: "/student/fees",
        icon: Wallet,
        roles: ["student"],
      },
      {
        label: "ID Card",
        href: "/student/id-card",
        icon: Landmark,
        roles: ["student"],
      },
    ],
  },
  {
    title: "Teaching",
    items: [
      {
        label: "My Timetable",
        href: "/faculty/timetable",
        icon: CalendarRange,
        roles: ["faculty"],
      },
      {
        label: "Attendance",
        href: "/faculty/attendance",
        icon: ClipboardList,
        roles: ["faculty"],
      },
    ],
  },
  {
    title: "Institution",
    items: [
      {
        label: "Setup Wizard",
        href: "/admin/setup",
        icon: Landmark,
        roles: ["super_admin", "admin"],
      },
      {
        label: "Hierarchy",
        href: "/admin/hierarchy",
        icon: Network,
        roles: ["super_admin", "admin", "registrar"],
      },
      {
        label: "Campuses",
        href: "/admin/campuses",
        icon: Building2,
        roles: ["super_admin", "admin"],
      },
      {
        label: "Faculties",
        href: "/admin/faculties",
        icon: Building2,
        roles: ["super_admin", "admin", "dean"],
      },
      {
        label: "Departments",
        href: "/admin/departments",
        icon: Building2,
        roles: ["super_admin", "admin", "dean", "hod"],
      },
      {
        label: "Programs",
        href: "/admin/programs",
        icon: GraduationCap,
        roles: ["super_admin", "admin", "dean", "hod"],
      },
      {
        label: "Semesters",
        href: "/admin/semesters",
        icon: CalendarRange,
        roles: ["super_admin", "admin", "registrar"],
      },
      {
        label: "Courses",
        href: "/admin/courses",
        icon: BookOpen,
        roles: ["super_admin", "admin", "hod"],
      },
      {
        label: "Course Offerings",
        href: "/admin/course-offerings",
        icon: BookOpen,
        roles: ["super_admin", "admin", "dean", "hod"],
      },
      {
        label: "Master Timetable",
        href: "/admin/timetable",
        icon: CalendarRange,
        roles: ["super_admin", "admin", "registrar"],
      },
      {
        label: "Reports",
        href: "/admin/reports",
        icon: ClipboardList,
        roles: ["super_admin", "admin", "registrar", "dean", "hod"],
      },
    ],
  },
  {
    title: "People",
    items: [
      {
        label: "Students",
        href: "/admin/students",
        icon: Users,
        roles: ["super_admin", "admin", "registrar", "dean", "hod"],
      },
      {
        label: "Admissions",
        href: "/admin/admissions",
        icon: ClipboardList,
        roles: ["super_admin", "admin", "registrar"],
      },
      {
        label: "Employees",
        href: "/hr",
        icon: UserCog,
        roles: ["super_admin", "admin", "hr"],
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        label: "Finance",
        href: "/finance",
        icon: Wallet,
        roles: ["super_admin", "admin", "finance"],
      },
      {
        label: "Library",
        href: "/library",
        icon: Library,
        roles: ["super_admin", "admin", "librarian"],
      },
    ],
  },
]
