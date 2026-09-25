import { NextResponse } from "next/server"

import { getStripe } from "@/lib/stripe"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { invoiceId, amount } = (await request.json()) as { invoiceId: string; amount: number }
  if (!invoiceId || !amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid invoice or amount" }, { status: 400 })
  }

  // RLS confirms the invoice belongs to this student (or their linked
  // guardian) before we ever talk to Stripe.
  const { data: invoice, error: invoiceError } = await supabase
    .from("fee_invoices")
    .select("id, invoice_number, amount_due, amount_paid")
    .eq("id", invoiceId)
    .single()
  if (invoiceError || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }

  try {
    const stripe = getStripe()
    const origin = new URL(request.url).origin

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amount * 100),
            product_data: { name: `Invoice ${invoice.invoice_number}` },
          },
          quantity: 1,
        },
      ],
      metadata: { invoice_id: invoiceId, student_id: user.id },
      success_url: `${origin}/student/fees?paid=1`,
      cancel_url: `${origin}/student/fees`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment setup failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
