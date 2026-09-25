"use client"

import * as React from "react"
import { Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const passwordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})

const magicLinkSchema = z.object({
  email: z.string().email("Enter a valid email address"),
})

const ssoSchema = z.object({
  domain: z.string().min(3, "Enter your university's email domain"),
})

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirectTo") ?? "/"
  const [magicLinkSent, setMagicLinkSent] = React.useState(false)

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { email: "", password: "" },
  })

  const magicLinkForm = useForm<z.infer<typeof magicLinkSchema>>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: "" },
  })

  const ssoForm = useForm<z.infer<typeof ssoSchema>>({
    resolver: zodResolver(ssoSchema),
    defaultValues: { domain: "" },
  })

  async function onPasswordSubmit(values: z.infer<typeof passwordSchema>) {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      toast.error(error.message)
      return
    }
    router.push(redirectTo)
    router.refresh()
  }

  async function onMagicLinkSubmit(values: z.infer<typeof magicLinkSchema>) {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: values.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      },
    })
    if (error) {
      toast.error(error.message)
      return
    }
    setMagicLinkSent(true)
  }

  async function onGoogleSignIn() {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      },
    })
    if (error) toast.error(error.message)
  }

  async function onSsoSubmit(values: z.infer<typeof ssoSchema>) {
    const supabase = createClient()
    // Requires the university's SAML SSO provider to be registered against
    // this domain via the Supabase Management API beforehand.
    const { data, error } = await supabase.auth.signInWithSSO({
      domain: values.domain,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      },
    })
    if (error) {
      toast.error(error.message)
      return
    }
    if (data?.url) window.location.href = data.url
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Access your Zicon UMS dashboard</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" className="w-full" onClick={onGoogleSignIn} type="button">
          Continue with Google
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <Tabs defaultValue="password">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="magic-link">Magic link</TabsTrigger>
            <TabsTrigger value="sso">SSO</TabsTrigger>
          </TabsList>

          <TabsContent value="password" className="pt-4">
            <Form {...passwordForm}>
              <form
                onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={passwordForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@university.edu" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Password</FormLabel>
                        <Link
                          href="/forgot-password"
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          Forgot password?
                        </Link>
                      </div>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={passwordForm.formState.isSubmitting}
                >
                  {passwordForm.formState.isSubmitting ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="magic-link" className="pt-4">
            {magicLinkSent ? (
              <p className="text-sm text-muted-foreground">
                Check your inbox for a sign-in link.
              </p>
            ) : (
              <Form {...magicLinkForm}>
                <form
                  onSubmit={magicLinkForm.handleSubmit(onMagicLinkSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={magicLinkForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="you@university.edu" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={magicLinkForm.formState.isSubmitting}
                  >
                    Send magic link
                  </Button>
                </form>
              </Form>
            )}
          </TabsContent>

          <TabsContent value="sso" className="pt-4">
            <Form {...ssoForm}>
              <form onSubmit={ssoForm.handleSubmit(onSsoSubmit)} className="space-y-4">
                <FormField
                  control={ssoForm.control}
                  name="domain"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>University email domain</FormLabel>
                      <FormControl>
                        <Input placeholder="university.edu" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={ssoForm.formState.isSubmitting}
                >
                  Continue with SSO
                </Button>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        Don&apos;t have an account?&nbsp;
        <Link href="/register" className="text-foreground hover:underline">
          Register
        </Link>
      </CardFooter>
    </Card>
  )
}
