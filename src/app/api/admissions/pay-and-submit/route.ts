import { NextResponse } from "next/server"

import { getStripe } from "@/lib/stripe"
import { createClient } from "@/lib/supabase/server"

const APPLICATION_FEE_USD = 50

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { applicationId } = (await request.json()) as { applicationId: string }
  const { data: application, error } = await supabase
    .from("applications")
    .select("id, application_number, applicant_id")
    .eq("id", applicationId)
    .single()
  if (error || !application || application.applicant_id !== user.id) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  await supabase
    .from("applications")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", applicationId)

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
            unit_amount: APPLICATION_FEE_USD * 100,
            product_data: { name: `Application fee — ${application.application_number}` },
          },
          quantity: 1,
        },
      ],
      metadata: { application_id: applicationId },
      success_url: `${origin}/admissions/apply/thank-you`,
      cancel_url: `${origin}/admissions`,
    })
    return NextResponse.json({ url: session.url })
  } catch {
    // No STRIPE_SECRET_KEY configured yet — the application is still marked
    // submitted so the flow isn't blocked; fee collection can be reconciled
    // manually until Stripe is wired up.
    return NextResponse.json({ url: null })
  }
}
