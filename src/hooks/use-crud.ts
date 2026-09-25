"use client"

// supabase-js's fluent query builder resolves column/value types per call
// against a concrete table literal; a generic table name can't narrow those,
// so this file intentionally drops to `any` at the query-builder boundary
// and recovers static types via the Row<T>/Insert<T>/Update<T> return casts.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/types/database"

type TableName = keyof Database["public"]["Tables"]
type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"]
type Insert<T extends TableName> = Database["public"]["Tables"][T]["Insert"]
type Update<T extends TableName> = Database["public"]["Tables"][T]["Update"]

// Generic list/create/update/delete wiring for a Supabase table, scoped to
// one university. Institution CRUD pages (Step 4) and similar admin list
// pages compose this instead of hand-rolling the same query/mutation
// boilerplate six times over.
export function useCrud<T extends TableName>(table: T, universityId: string | null) {
  const queryClient = useQueryClient()
  const queryKey = [table, universityId] as const

  const list = useQuery({
    queryKey,
    enabled: !!universityId,
    queryFn: async () => {
      const supabase = createClient()
      // supabase-js's generics resolve per-call against a concrete table
      // literal; a generic T can't narrow "university_id" as a valid
      // column, so the query chain is built untyped and the result cast
      // back to Row<T> at the boundary.
      const { data, error } = await (supabase.from(table) as any)
        .select("*")
        .eq("university_id", universityId!)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data as Row<T>[]
    },
  })

  const create = useMutation({
    mutationFn: async (values: Insert<T>) => {
      const supabase = createClient()
      const { error } = await (supabase.from(table) as any).insert(values)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      toast.success("Created successfully")
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Update<T> }) => {
      const supabase = createClient()
      const { error } = await (supabase.from(table) as any).update(values).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      toast.success("Updated successfully")
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase.from(table) as any).delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      toast.success("Deleted")
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const removeMany = useMutation({
    mutationFn: async (ids: string[]) => {
      const supabase = createClient()
      const { error } = await (supabase.from(table) as any).delete().in("id", ids)
      if (error) throw error
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey })
      toast.success(`Deleted ${ids.length} record(s)`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return { list, create, update, remove, removeMany }
}
