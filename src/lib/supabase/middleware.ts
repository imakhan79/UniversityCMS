import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

import type { Database } from "@/types/database"
import { rolesAllowedForPath } from "@/lib/auth/route-roles"

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/unauthorized",
  "/auth/callback",
]

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return true
  return false
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: getUser() re-validates the session against Supabase Auth on
  // every request — do not swap this for getSession(), which only reads the
  // (possibly stale/forged) local cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl

  if (isPublicPath(pathname)) {
    return response
  }

  if (!user) {
    const redirectUrl = new URL("/login", request.url)
    redirectUrl.searchParams.set("redirectTo", pathname + search)
    return NextResponse.redirect(redirectUrl)
  }

  const allowedRoles = rolesAllowedForPath(pathname)
  if (allowedRoles) {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role, expires_at")
      .eq("user_id", user.id)
      .eq("is_active", true)

    const now = Date.now()
    const hasAccess = (roles ?? []).some(
      (r) =>
        allowedRoles.includes(r.role) &&
        (!r.expires_at || new Date(r.expires_at).getTime() > now)
    )
    if (!hasAccess) {
      return NextResponse.redirect(new URL("/unauthorized", request.url))
    }
  }

  return response
}
