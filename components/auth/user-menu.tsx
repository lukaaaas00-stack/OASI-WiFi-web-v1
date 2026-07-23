import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { destroySession, getSession } from "@/lib/auth";

export interface UserMenuProps {
  className?: string;
}

function getInitial(nameOrEmail: string): string {
  return nameOrEmail.trim().charAt(0).toUpperCase() || "U";
}

async function logoutAction() {
  "use server";
  await destroySession();
  redirect("/login");
}

export async function UserMenu({ className }: UserMenuProps) {
  const user = await getSession();
  if (!user) return null;

  const label = user.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-9 rounded-full", className)}
          aria-label="Open user menu"
        >
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-medium">{getInitial(label)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          <span className="block truncate text-sm">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" className="h-auto w-full justify-start gap-2 px-2 py-1.5 font-normal">
            <LogOut className="size-4" />
            <span>Log out</span>
          </Button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
