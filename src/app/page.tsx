import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="max-w-2xl text-center space-y-8">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            For Robinhood users
          </p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            Am I wasting my time and money by stock-picking?
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Upload your Robinhood transaction history and find out — honestly —
            how your picks have done versus a simple &quot;just buy VTI&quot;
            strategy. No broker login. Your data stays private.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/auth/signup">Get started</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/auth/login">Log in</Link>
          </Button>
        </div>

        <div className="pt-12 text-sm text-muted-foreground space-y-2 max-w-md mx-auto">
          <p>
            <strong className="text-foreground">How it works:</strong> upload
            your Robinhood activity CSV, pick up to 5 benchmark tickers, enter
            your current portfolio value, see an interactive comparison chart
            and summary table.
          </p>
          <p>
            Up to 5 saved analyses per account. Open source on{" "}
            <Link
              href="https://github.com/vinamrajain99/do-i-beat-the-index"
              className="underline underline-offset-4 hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
