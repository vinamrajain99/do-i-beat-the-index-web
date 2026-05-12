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
import { AnalysisRunner } from "./analysis-runner";
import { PlotlyChart } from "./plotly-chart";
import { ResultsSummary } from "./results-summary";
import { DeleteButton } from "../delete-button";

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
    <main className="flex-1 flex flex-col px-6 py-8 gap-6 max-w-7xl mx-auto w-full">
      <Link
        href="/dashboard"
        className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline self-start max-w-3xl w-full mx-auto"
      >
        ← Back to dashboard
      </Link>

      <header className="flex items-start justify-between gap-4 max-w-3xl w-full mx-auto">
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

      <Card className="max-w-3xl w-full mx-auto">
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
        <Card className="max-w-3xl w-full mx-auto">
          <CardHeader>
            <CardTitle className="text-base">
              {analysis.status === "pending" ? "Queued" : "Running"}
            </CardTitle>
            <CardDescription>
              We&apos;re computing your XIRR, CAGR, and the deposit-mirrored
              counterfactual for each benchmark. This page will refresh
              automatically when the results are ready.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnalysisRunner
              analysisId={analysis.id}
              initialStatus={analysis.status}
              createdAt={analysis.created_at}
            />
          </CardContent>
        </Card>
      ) : analysis.status === "failed" ? (
        <Card className="max-w-3xl w-full mx-auto">
          <CardHeader>
            <CardTitle className="text-base">Analysis failed</CardTitle>
            <CardDescription>
              {analysis.error_message ??
                "Something went wrong while running this analysis."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : analysis.results_json ? (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-base">Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <PlotlyChart figureJson={analysis.results_json.figure_json} />
            <ResultsSummary results={analysis.results_json} />
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-3xl w-full mx-auto">
          <CardHeader>
            <CardTitle className="text-base">Results</CardTitle>
            <CardDescription>
              Analysis completed but no results were recorded. This row may
              need to be re-run.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3 max-w-3xl w-full mx-auto">
        <DeleteButton
          analysisId={analysis.id}
          analysisName={analysis.name}
          size="default"
        />
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
