import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/auth/sign-out/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="flex-1 flex flex-col px-6 py-8 gap-6 max-w-3xl mx-auto w-full">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your analyses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Signed in as <strong>{user.email}</strong>
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>No analyses yet</CardTitle>
          <CardDescription>
            CSV upload and analysis is coming next. Once it&apos;s wired up,
            this page will list your saved analyses (up to 5) and let you
            create a new one or delete an old one to make room.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled className="w-full sm:w-auto">
            + New analysis (coming soon)
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
