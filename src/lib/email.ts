import "server-only"
import { Resend } from "resend"

// Best-effort: logs and returns rather than throwing when RESEND_API_KEY
// isn't set (not provided to this session), so callers can fire-and-forget
// without every notification path needing a try/catch around email.
export async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set — skipped "${subject}" to ${to}`)
    return { skipped: true }
  }

  const resend = new Resend(apiKey)
  const from = process.env.RESEND_FROM_EMAIL ?? "no-reply@zicon-ums.example"

  const { error } = await resend.emails.send({ from, to, subject, html })
  if (error) throw new Error(error.message)
  return { skipped: false }
}
