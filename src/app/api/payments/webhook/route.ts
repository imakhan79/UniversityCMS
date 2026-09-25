import { NextResponse } from "next/server"
import type Stripe from "stripe"

import { getStripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"

// Configure this URL as a Stripe webhook endpoint listening for
// `checkout.session.completed`, with STRIPE_WEBHOOK_SECRET set to its
// signing secret. Uses the admin client because Stripe's webhook call has
// no Supabase session to satisfy RLS.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  const body = await request.text()
  let event: Stripe.Event

  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    const invoiceId = session.metadata?.invoice_id
    const studentId = session.metadata?.student_id
    const amountPaid = (session.amount_total ?? 0) / 100

    if (invoiceId && studentId) {
      const admin = createAdminClient()

      await admin.from("payments").insert({
        fee_invoice_id: invoiceId,
        student_id: studentId,
        university_id: (
          await admin.from("fee_invoices").select("university_id").eq("id", invoiceId).single()
        ).data?.university_id,
        amount: amountPaid,
        payment_method: "online",
        status: "completed",
        transaction_reference: session.payment_intent as string,
      } as never)

      const { data: invoice } = await admin
        .from("fee_invoices")
        .select("amount_due, amount_paid")
        .eq("id", invoiceId)
        .single()

      if (invoice) {
        const newPaid = invoice.amount_paid + amountPaid
        await admin
          .from("fee_invoices")
          .update({
            amount_paid: newPaid,
            status: newPaid >= invoice.amount_due ? "paid" : "partially_paid",
          })
          .eq("id", invoiceId)
      }
    }
  }

  return NextResponse.json({ received: true })
}
