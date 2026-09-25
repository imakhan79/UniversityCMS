import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"

interface NotifyInput {
  recipientId: string
  universityId: string
  title: string
  body: string
  type?: "info" | "warning" | "success" | "error" | "academic" | "financial" | "system"
  emailSubject?: string
  emailHtml?: string
}

// Fires an in-app notification (always) and an email via Resend (best
// effort — silently skipped without RESEND_API_KEY, see lib/email.ts).
// Used at each admissions/exam/finance stage transition.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const {
    data: { user: caller },
  } = await supabase.auth.getUser()
  if (!caller) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const input = (await request.json()) as NotifyInput
  if (!input.recipientId || !input.universityId || !input.title) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const { data: callerRoles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .eq("university_id", input.universityId)
    .eq("is_active", true)
  if (!callerRoles || callerRoles.length === 0) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  }

  const admin = createAdminClient()
  await admin.from("notifications").insert({
    university_id: input.universityId,
    recipient_id: input.recipientId,
    type: input.type ?? "info",
    title: input.title,
    body: input.body,
  })

  if (input.emailSubject) {
    const { data: authUser } = await admin.auth.admin.getUserById(input.recipientId)
    if (authUser.user?.email) {
      try {
        await sendEmail(authUser.user.email, input.emailSubject, input.emailHtml ?? input.body)
      } catch (e) {
        console.error("[notify] email send failed", e)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
