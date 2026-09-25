import Link from "next/link"
import { CheckCircle2 } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function ThankYouPage() {
  return (
    <Card className="mx-auto max-w-md text-center">
      <CardHeader>
        <CheckCircle2 className="mx-auto size-10 text-primary" />
        <CardTitle>Application submitted</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          We&apos;ll email you as your application moves through review, testing, and merit list
          stages.
        </p>
        <Button render={<Link href="/login" />}>Sign in to track status</Button>
      </CardContent>
    </Card>
  )
}
