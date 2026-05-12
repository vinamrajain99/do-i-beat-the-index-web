import { cn } from "@/lib/utils";
import type { MetricsSummary, ResultsJson } from "@/lib/types";

type Props = {
  results: ResultsJson;
};

function fmtUsd(n: number | null, signed = false): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const formatted = Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  if (!signed) return n < 0 ? `-${formatted}` : formatted;
  return n > 0 ? `+${formatted}` : n < 0 ? `-${formatted}` : formatted;
}

function fmtPct(n: number | null, signed = false): string {
  // Metrics are stored as fractions (0.12 = 12%); convert to percent for display.
  if (n === null || !Number.isFinite(n)) return "—";
  const pct = n * 100;
  const formatted = `${Math.abs(pct).toFixed(2)}%`;
  if (!signed) return pct < 0 ? `-${formatted}` : formatted;
  return pct > 0 ? `+${formatted}` : pct < 0 ? `-${formatted}` : formatted;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function deltaClass(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta) || delta === 0)
    return "text-muted-foreground";
  // Sign convention: delta = benchmark - actual. Positive = benchmark beat
  // the user's picks (a worse outcome from the user's POV → red). Negative
  // = user's picks beat the benchmark → green.
  return delta > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-500";
}

function MetricRow({
  label,
  metrics,
  delta,
  ranOut,
}: {
  label: string;
  metrics: MetricsSummary;
  delta: { dollars: number | null; pct: number | null } | null;
  ranOut?: boolean;
}) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="py-2 pr-4 font-medium">
        {label}
        {ranOut ? (
          <span className="ml-2 text-xs text-destructive">(ran out)</span>
        ) : null}
      </td>
      <td className="py-2 px-2 text-right tabular-nums">
        {fmtUsd(metrics.final_value)}
      </td>
      <td className="py-2 px-2 text-right tabular-nums">
        {fmtUsd(metrics.dollar_gain, true)}
      </td>
      <td className="py-2 px-2 text-right tabular-nums">
        {fmtPct(metrics.total_return_pct, true)}
      </td>
      <td className="py-2 px-2 text-right tabular-nums">
        {fmtPct(metrics.cagr, true)}
      </td>
      <td className="py-2 px-2 text-right tabular-nums">
        {fmtPct(metrics.xirr, true)}
      </td>
      <td
        className={cn(
          "py-2 px-2 text-right tabular-nums",
          delta ? deltaClass(delta.dollars) : "text-muted-foreground",
        )}
      >
        {delta ? fmtUsd(delta.dollars, true) : "—"}
      </td>
      <td
        className={cn(
          "py-2 pl-2 pr-0 text-right tabular-nums",
          delta ? deltaClass(delta.pct) : "text-muted-foreground",
        )}
      >
        {delta ? fmtPct(delta.pct, true) : "—"}
      </td>
    </tr>
  );
}

export function ResultsSummary({ results }: Props) {
  const { summary } = results;
  const actualFinal = summary.actual.final_value;

  const benchmarkRows = Object.entries(summary.benchmarks).map(
    ([ticker, m]) => {
      let deltaDollars: number | null = null;
      let deltaPct: number | null = null;
      if (
        m.final_value !== null &&
        actualFinal !== null &&
        Number.isFinite(m.final_value) &&
        Number.isFinite(actualFinal)
      ) {
        deltaDollars = m.final_value - actualFinal;
        deltaPct = actualFinal !== 0 ? deltaDollars / actualFinal : null;
      }
      return {
        ticker,
        metrics: m,
        delta: { dollars: deltaDollars, pct: deltaPct },
        ranOut: summary.benchmark_ran_out[ticker] === true,
      };
    },
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {summary.deposits_count} deposits
        {summary.withdrawals_count > 0
          ? `, ${summary.withdrawals_count} withdrawals`
          : ""}
        {" · "}
        {fmtDate(summary.date_range[0])} – {fmtDate(summary.date_range[1])}
        {" · "}
        as of {fmtDate(summary.as_of)}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-2 pr-4 text-left font-medium">Strategy</th>
              <th className="py-2 px-2 text-right font-medium">Final value</th>
              <th className="py-2 px-2 text-right font-medium">$ gain</th>
              <th className="py-2 px-2 text-right font-medium">Total return</th>
              <th className="py-2 px-2 text-right font-medium">CAGR</th>
              <th className="py-2 px-2 text-right font-medium">XIRR</th>
              <th className="py-2 px-2 text-right font-medium">Δ $ vs you</th>
              <th className="py-2 pl-2 pr-0 text-right font-medium">Δ % vs you</th>
            </tr>
          </thead>
          <tbody>
            <MetricRow
              label="Your portfolio"
              metrics={summary.actual}
              delta={null}
            />
            {benchmarkRows.map((r) => (
              <MetricRow
                key={r.ticker}
                label={r.ticker}
                metrics={r.metrics}
                delta={r.delta}
                ranOut={r.ranOut}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Positive Δ means the benchmark beat your picks. Negative Δ means your
        picks beat the benchmark.
      </p>
    </div>
  );
}
