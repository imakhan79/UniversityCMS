"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { RoleGuard } from "@/components/auth/role-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function useMyInvoices(studentId: string | undefined) {
  return useQuery({
    queryKey: ["my-invoices", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("fee_invoices")
        .select("*")
        .eq("student_id", studentId!)
        .order("due_date", { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export default function StudentFeesPage() {
  return (
    <RoleGuard allow={["student"]}>
      <StudentFeesContent />
    </RoleGuard>
  )
}

function StudentFeesContent() {
  const { data: user } = useUser()
  const { data: invoices, isLoading } = useMyInvoices(user?.id)
  const queryClient = useQueryClient()

  async function payNow(invoiceId: string, amount: number) {
    // Stripe Checkout integration point. Requires STRIPE_SECRET_KEY server-
    // side (not provided to this session) — this calls a Route Handler that
    // creates a Checkout Session and redirects to it.
    const res = await fetch("/api/payments/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId, amount }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? "Payment is not configured yet — add STRIPE_SECRET_KEY.")
      return
    }
    const { url } = await res.json()
    if (url) window.location.href = url
    queryClient.invalidateQueries({ queryKey: ["my-invoices", user?.id] })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Fees</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (invoices ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Amount due</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices!.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.invoice_number}</TableCell>
                    <TableCell>{inv.due_date}</TableCell>
                    <TableCell>${inv.amount_due}</TableCell>
                    <TableCell>${inv.amount_paid}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{inv.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {inv.status !== "paid" && (
                        <Button
                          size="sm"
                          onClick={() => payNow(inv.id, inv.amount_due - inv.amount_paid)}
                        >
                          Pay now
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
