import { Forbidden } from "@/components/auth/role-guard"

export default function UnauthorizedPage() {
  return <Forbidden />
}
