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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

function LoadingDots() {
  return (
    <span
      className="inline-flex items-center gap-1.5 align-middle"
      aria-label="Loading"
      role="status"
    >
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-pulse" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:200ms]" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:400ms]" />
    </span>
  );
}

function StatTile({
  label,
  value,
  loading = false,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  const showDots = loading && value === "—";
  return (
    <div>
      <dt className="text-[0.7rem] uppercase tracking-wider font-medium text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1.5 text-lg font-semibold tabular-nums text-foreground">
        {showDots ? <LoadingDots /> : value}
      </dd>
    </div>
  );
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
  const isLoading =
    analysis.status === "pending" || analysis.status === "running";

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

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl w-full mx-auto items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cash flow</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
              <StatTile
                label="Total deposited"
                value={fmtUsd(
                  analysis.results_json?.summary.actual.total_deposited,
                )}
                loading={isLoading}
              />
              <StatTile
                label="Deposits"
                value={fmtCount(
                  analysis.results_json?.summary.deposits_count,
                )}
                loading={isLoading}
              />
              <StatTile
                label="Total withdrawn"
                value={fmtUsd(
                  analysis.results_json?.summary.actual.total_withdrawn,
                )}
                loading={isLoading}
              />
              <StatTile
                label="Withdrawals"
                value={fmtCount(
                  analysis.results_json?.summary.withdrawals_count,
                )}
                loading={isLoading}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current value</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
              <StatTile
                label="Your portfolio"
                value={fmtUsd(analysis.current_value_usd)}
              />
              {analysis.benchmark_tickers.map((ticker) => (
                <StatTile
                  key={ticker}
                  label={ticker}
                  value={fmtUsd(
                    analysis.results_json?.summary.benchmarks[ticker]
                      ?.final_value,
                  )}
                  loading={isLoading}
                />
              ))}
            </dl>
          </CardContent>
        </Card>
      </section>

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
