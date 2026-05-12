"use client";

import { useActionState, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  BENCHMARK_DEFAULTS,
  MAX_BENCHMARKS,
  TICKER_REGEX,
} from "@/lib/types";
import {
  createAnalysisAction,
  type CreateAnalysisState,
} from "./actions";

export default function NewAnalysisPage() {
  const [state, formAction, pending] = useActionState<
    CreateAnalysisState,
    FormData
  >(createAnalysisAction, undefined);

  // Selected benchmark tickers (1..MAX_BENCHMARKS).
  const [selected, setSelected] = useState<string[]>([]);
  // In-flight custom-ticker input value.
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const atCap = selected.length >= MAX_BENCHMARKS;

  function toggleDefault(ticker: string) {
    setCustomError(null);
    setSelected((prev) =>
      prev.includes(ticker)
        ? prev.filter((t) => t !== ticker)
        : prev.length < MAX_BENCHMARKS
          ? [...prev, ticker]
          : prev,
    );
  }

  function addCustom() {
    const t = custom.trim().toUpperCase();
    if (!t) return;
    if (!TICKER_REGEX.test(t)) {
      setCustomError("Tickers are 1–10 chars: letters, digits, dot, dash.");
      return;
    }
    if (selected.includes(t)) {
      setCustomError(`${t} is already selected.`);
      return;
    }
    if (selected.length >= MAX_BENCHMARKS) {
      setCustomError(`You've already picked ${MAX_BENCHMARKS}.`);
      return;
    }
    setSelected((prev) => [...prev, t]);
    setCustom("");
    setCustomError(null);
  }

  function removeSelected(ticker: string) {
    setSelected((prev) => prev.filter((t) => t !== ticker));
    setCustomError(null);
  }

  function onCustomKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustom();
    }
  }

  return (
    <main className="flex-1 flex flex-col px-6 py-8 gap-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New analysis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload your Robinhood activity CSV and pick 1–{MAX_BENCHMARKS}{" "}
          benchmarks. We&apos;ll compute how each benchmark would have performed
          if it had received the same deposits and withdrawals on the same days.
        </p>
      </header>

      <Card>
        <form action={formAction}>
          <CardHeader className="sr-only">
            <CardTitle>Analysis details</CardTitle>
            <CardDescription>Form fields</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* --- Name --- */}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="My May 2026 portfolio"
                maxLength={80}
                required
              />
              <p className="text-xs text-muted-foreground">
                Helps you tell saved analyses apart later.
              </p>
            </div>

            {/* --- Current portfolio value --- */}
            <div className="space-y-2">
              <Label htmlFor="current_value_usd">
                Current portfolio value (USD)
              </Label>
              <Input
                id="current_value_usd"
                name="current_value_usd"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                placeholder="25000.00"
                required
              />
              <p className="text-xs text-muted-foreground">
                The number from your Robinhood account summary today. We use
                this as the &quot;actual&quot; endpoint to compare against each
                benchmark.
              </p>
            </div>

            {/* --- Benchmarks --- */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <Label>
                  Benchmarks{" "}
                  <span className="text-muted-foreground font-normal">
                    (1–{MAX_BENCHMARKS})
                  </span>
                </Label>
                <span
                  className={cn(
                    "text-xs",
                    atCap
                      ? "text-foreground font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {selected.length} / {MAX_BENCHMARKS} selected
                </span>
              </div>

              {/* Common chips */}
              <div className="flex flex-wrap gap-2">
                {BENCHMARK_DEFAULTS.map((ticker) => {
                  const isSelected = selected.includes(ticker);
                  const disabled = !isSelected && atCap;
                  return (
                    <button
                      key={ticker}
                      type="button"
                      onClick={() => toggleDefault(ticker)}
                      disabled={disabled}
                      className={cn(
                        "inline-flex items-center justify-center rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                          : "border-input bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer",
                      )}
                      aria-pressed={isSelected}
                    >
                      {ticker}
                    </button>
                  );
                })}
              </div>

              {/* Custom ticker input */}
              <div className="space-y-2">
                <Label htmlFor="custom-ticker" className="text-xs font-normal text-muted-foreground">
                  Or add a custom ticker (e.g. NVDA, BRK.B):
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="custom-ticker"
                    value={custom}
                    onChange={(e) => {
                      setCustom(e.target.value);
                      setCustomError(null);
                    }}
                    onKeyDown={onCustomKey}
                    placeholder="NVDA"
                    maxLength={10}
                    disabled={atCap}
                    className="uppercase"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addCustom}
                    disabled={atCap || custom.trim().length === 0}
                  >
                    Add
                  </Button>
                </div>
                {customError && (
                  <p className="text-xs text-destructive" role="alert">
                    {customError}
                  </p>
                )}
              </div>

              {/* Selected list */}
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {selected.map((ticker) => (
                    <span
                      key={ticker}
                      className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm font-medium text-foreground"
                    >
                      {ticker}
                      <button
                        type="button"
                        onClick={() => removeSelected(ticker)}
                        className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-background cursor-pointer"
                        aria-label={`Remove ${ticker}`}
                      >
                        ×
                      </button>
                      {/* Hidden field that the form actually submits. */}
                      <input type="hidden" name="benchmarks" value={ticker} />
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* --- CSV file --- */}
            <div className="space-y-2">
              <Label htmlFor="csv">Robinhood activity CSV</Label>
              <Input
                id="csv"
                name="csv"
                type="file"
                accept=".csv,text/csv,application/vnd.ms-excel,text/plain"
                required
              />
              <p className="text-xs text-muted-foreground">
                Max 10 MB. Get this from Robinhood → Account → History →
                Download CSV. We only read deposit and withdrawal rows; trades,
                dividends, and crypto activity are ignored.
              </p>
            </div>

            {/* --- Server-side error --- */}
            {state?.error && (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            )}

            {/* --- Submit --- */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
              <Button asChild variant="ghost" type="button">
                <Link href="/dashboard">Cancel</Link>
              </Button>
              <Button
                type="submit"
                disabled={pending || selected.length === 0}
              >
                {pending ? "Saving…" : "Run analysis"}
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    </main>
  );
}
