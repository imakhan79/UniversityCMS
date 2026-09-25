"use client"

import * as React from "react"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  )
}

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get("email")
  const [resending, setResending] = React.useState(false)

  async function resend() {
    if (!email) {
      toast.error("We don't have an email address to resend to — try registering again.")
      return
    }
    setResending(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resend({ type: "signup", email })
    setResending(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Verification email resent.")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your inbox</CardTitle>
        <CardDescription>
          We&apos;ve sent a verification link to your email address. Click it to
          activate your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="w-full" onClick={resend} disabled={resending}>
          {resending ? "Resending..." : "Resend verification email"}
        </Button>
      </CardContent>
    </Card>
  )
}
