import OasiApp from "@/app/oasi-app"
import { UserMenu } from "@/components/auth/user-menu"

export default function HomePage() {
  return (
    <OasiApp
      userMenu={
        <UserMenu className="size-11 border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 focus-visible:ring-teal-700/30" />
      }
    />
  )
}
