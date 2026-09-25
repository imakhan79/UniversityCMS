import "server-only"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

// Server-only client using the service role key — bypasses RLS entirely.
// Only ever import this from Route Handlers / Server Actions that
// themselves check the caller's role first; never expose it to the client.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in the environment (Project Settings
// -> API -> service_role in the Supabase dashboard). Not set here since it
// was never shared with this session — routes using this client will 500
// until it's added to .env.local (and to the Vercel project's env vars).
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — required for admin operations like creating users."
    )
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
