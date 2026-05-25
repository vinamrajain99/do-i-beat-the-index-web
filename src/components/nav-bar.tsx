import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/auth/sign-out/actions";
import { Button } from "@/components/ui/button";
import { NavLink } from "./nav-link";

export async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <nav className="max-w-7xl mx-auto h-14 px-6 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="font-semibold tracking-tight text-sm whitespace-nowrap hover:text-foreground/80 transition-colors"
        >
          Do I beat the index?
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          {user && <NavLink href="/dashboard">Dashboard</NavLink>}
          <NavLink href="/about">About</NavLink>

          <div className="w-px h-5 bg-border mx-1 sm:mx-2" />

          {user ? (
            <>
              <span
                className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[18ch]"
                title={user.email ?? undefined}
              >
                {user.email}
              </span>
              <form action={signOutAction}>
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/auth/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/auth/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
