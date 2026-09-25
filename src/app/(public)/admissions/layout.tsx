import Link from "next/link"
import { GraduationCap } from "lucide-react"

export default function AdmissionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/admissions" className="flex items-center gap-2 font-semibold">
            <GraduationCap className="size-5 text-primary" /> Admissions
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Already applied? Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  )
}
