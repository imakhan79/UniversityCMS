import "server-only"
import Stripe from "stripe"

let stripeClient: Stripe | null = null

// Lazily constructed so importing this module doesn't throw when the key
// isn't set yet — only routes that actually try to charge do.
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set — add it to .env.local and the Vercel project.")
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return stripeClient
}
