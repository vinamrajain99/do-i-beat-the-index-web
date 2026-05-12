import Link from "next/link";
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
import { cn } from "@/lib/utils";
import {
  MAX_ANALYSES_PER_USER,
  type AnalysisStatus,
} from "@/lib/types";

type AnalysisListRow = {
  id: string;
  name: string;
  status: AnalysisStatus;
  benchmark_tickers: string[];
  created_at: string;
};

const STATUS_LABEL: Record<AnalysisStatus, string> = {
  pending: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

const STATUS_CLASSES: Record<AnalysisStatus, string> = {
  pending: "bg-muted text-foreground",
  running: "bg-primary/10 text-foreground border border-primary/30",
  completed: "bg-primary text-primary-foreground",
  failed: "bg-destructive/10 text-destructive border border-destructive/30",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: analyses } = await supabase
    .from("analyses")
    .select("id, name, status, benchmark_tickers, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ANALYSES_PER_USER);

  const list = (analyses ?? []) as AnalysisListRow[];
  const atCap = list.length >= MAX_ANALYSES_PER_USER;

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

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {list.length} / {MAX_ANALYSES_PER_USER} saved
          {atCap && " (at cap)"}
        </p>
        {atCap ? (
          <Button disabled title={`You can save up to ${MAX_ANALYSES_PER_USER} analyses.`}>
            + New analysis
          </Button>
        ) : (
          <Button asChild>
            <Link href="/dashboard/new">+ New analysis</Link>
          </Button>
        )}
      </div>

      {list.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No analyses yet</CardTitle>
            <CardDescription>
              Click <strong>+ New analysis</strong> above to upload your
              Robinhood activity CSV, pick benchmarks, and run your first
              comparison.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((a) => (
            <li key={a.id}>
              <Link
                href={`/dashboard/${a.id}`}
                className="block rounded-lg border bg-card text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Card className="border-0 shadow-none bg-transparent">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {a.benchmark_tickers.join(", ")} ·{" "}
                        {formatDate(a.created_at)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium",
                        STATUS_CLASSES[a.status],
                      )}
                    >
                      {STATUS_LABEL[a.status]}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {atCap && (
        <p className="text-xs text-muted-foreground">
          You&apos;re at the {MAX_ANALYSES_PER_USER}-analysis cap. Delete UI is
          coming in a later phase; for now you can free a slot via SQL.
        </p>
      )}
    </main>
  );
}
