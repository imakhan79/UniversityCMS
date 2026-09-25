"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { GraduationCap } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

function useAdmissionsCatalog() {
  return useQuery({
    queryKey: ["admissions-catalog"],
    queryFn: async () => {
      const supabase = createClient()
      const { data: university } = await supabase
        .from("universities")
        .select("id, name, short_name")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!university) return { university: null, programs: [] }

      const { data: programs } = await supabase
        .from("programs")
        .select("*")
        .eq("university_id", university.id)
        .eq("is_active", true)
        .order("name")

      return { university, programs: programs ?? [] }
    },
  })
}

export default function AdmissionsCatalogPage() {
  const { data, isLoading } = useAdmissionsCatalog()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {data?.university?.name ?? "University"} Admissions
        </h1>
        <p className="mt-1 text-muted-foreground">
          Explore our programs and apply online.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : data?.programs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No programs open for admission right now.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data?.programs.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <GraduationCap className="size-4 text-primary" />
                  <CardTitle className="text-base">{p.name}</CardTitle>
                </div>
                <CardDescription>{p.code}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{p.degree_level}</Badge>
                  <Badge variant="outline">{p.duration_years} years</Badge>
                  <Badge variant="outline">{p.total_credit_hours} credit hours</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Eligibility: minimum qualifying grades for {p.degree_level}-level admission.
                  Contact admissions for full criteria.
                </p>
                <Button size="sm" render={<Link href={`/admissions/apply/${p.id}`} />}>
                  Apply now
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
