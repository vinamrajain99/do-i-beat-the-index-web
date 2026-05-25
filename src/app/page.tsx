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
        <div className="space-y-6">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            For Robinhood users
            {" · "}
            <Link
              href="https://github.com/vinamrajain99/do-i-beat-the-index-web"
              className="underline underline-offset-4 hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Source on GitHub
            </Link>
          </p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            Do you actually beat a simple <em>Buy Index</em> strategy?
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Compare how your investment picks have done vs index investing. No
            broker login.
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

        <section className="pt-12 max-w-md mx-auto">
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-6">
            How it works
          </h2>
          <ol className="space-y-5 text-left">
            <li className="flex gap-4">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold tabular-nums"
              >
                1
              </span>
              <div className="text-sm pt-0.5">
                <p className="font-medium text-foreground">
                  Download your Robinhood transaction history as a CSV.
                </p>
                <p className="text-muted-foreground mt-1">
                  On Robinhood web: Account → Reports & Statements → Activity
                  report. Include all transactions from your very first one.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold tabular-nums"
              >
                2
              </span>
              <div className="text-sm pt-0.5">
                <p className="font-medium text-foreground">
                  Upload it here, pick up to 5 benchmark tickers, and enter
                  your current portfolio value.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold tabular-nums"
              >
                3
              </span>
              <div className="text-sm pt-0.5">
                <p className="font-medium text-foreground">
                  See an interactive comparison chart and summary table.
                </p>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </main>
  );
}
