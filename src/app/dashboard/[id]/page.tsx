import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { Analysis, AnalysisStatus } from "@/lib/types";

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

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AnalysisDetailPage({
  params,
}: {
  // Next.js 16 App Router: params is async.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // RLS scopes this to rows where user_id = auth.uid().
  // Another user's id (or a fake one) returns null → 404.
  const { data, error } = await supabase
    .from("analyses")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const analysis = data as Analysis;
  const statusLabel = STATUS_LABEL[analysis.status];
  const statusClasses = STATUS_CLASSES[analysis.status];

  return (
    <main className="flex-1 flex flex-col px-6 py-8 gap-6 max-w-3xl mx-auto w-full">
      <Link
        href="/dashboard"
        className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline self-start"
      >
        ← Back to dashboard
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {analysis.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Created {formatDate(analysis.created_at)}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium",
            statusClasses,
          )}
        >
          {statusLabel}
        </span>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submission</CardTitle>
          <CardDescription>What you entered for this analysis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Current portfolio value</dt>
              <dd className="font-medium">
                {formatUsd(analysis.current_value_usd)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Benchmarks</dt>
              <dd className="font-medium">
                {analysis.benchmark_tickers.join(", ")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {analysis.status === "pending" || analysis.status === "running" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Queued for analysis</CardTitle>
            <CardDescription>
              Your CSV has been saved securely. The analysis worker is the next
              phase of this project, so for now this page is a placeholder.
              When the worker ships, this page will show an interactive Plotly
              chart and a summary table (XIRR, CAGR, %/$ delta vs. actual) for
              each benchmark.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : analysis.status === "failed" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Analysis failed</CardTitle>
            <CardDescription>
              {analysis.error_message ??
                "Something went wrong while running this analysis."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Results</CardTitle>
            <CardDescription>
              Results rendering is part of Phase 4. The raw results are saved
              on this row; the chart UI is coming next.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="flex justify-end">
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
