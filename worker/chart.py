"""Build the comparison Plotly figure as JSON for the web frontend to rehydrate.

Ported from the CLI on 2026-05-12. The only behavioural change is the final
output: the CLI writes a self-contained HTML file; we return `fig.to_json()`
so it can be stored on `analyses.results_json` and rendered client-side by
Plotly.js in Phase 4.
"""

from __future__ import annotations

from datetime import date

import plotly.graph_objects as go
from plotly.subplots import make_subplots

from worker.benchmark import BenchmarkResult
from worker.metrics import Metrics
from worker.rh_parser import CashFlow


def _fmt_money(x: float | None) -> str:
    if x is None:
        return "—"
    sign = "-" if x < 0 else ""
    return f"{sign}${abs(x):,.2f}"


def _fmt_pct(x: float | None) -> str:
    if x is None:
        return "—"
    try:
        if x != x:  # NaN
            return "—"
    except TypeError:
        return "—"
    return f"{x * 100:+.2f}%"


def _summary_rows(
    actual_metrics: Metrics,
    benchmark_metrics: dict[str, tuple[BenchmarkResult, Metrics]],
) -> list[list[str]]:
    rows: list[list[str]] = []
    actual_final = actual_metrics.final_value
    rows.append(
        [
            "Actual portfolio",
            _fmt_money(actual_metrics.final_value),
            _fmt_money(actual_metrics.dollar_gain),
            _fmt_pct(actual_metrics.total_return_pct),
            _fmt_pct(actual_metrics.cagr),
            _fmt_pct(actual_metrics.xirr),
            "—",
            "—",
        ]
    )
    for ticker, (bm, bm_metrics) in benchmark_metrics.items():
        rows.append(
            [
                f"Benchmark: {ticker}" + (" (ran out)" if bm.ran_out else ""),
                _fmt_money(bm_metrics.final_value),
                _fmt_money(bm_metrics.dollar_gain),
                _fmt_pct(bm_metrics.total_return_pct),
                _fmt_pct(bm_metrics.cagr),
                _fmt_pct(bm_metrics.xirr),
                # Δ vs actual = (this benchmark) − (actual). Negative when the
                # benchmark underperformed; positive when it beat your picks.
                _fmt_money(bm_metrics.final_value - actual_final),
                _fmt_pct(
                    (bm_metrics.final_value / actual_final - 1)
                    if actual_final > 0
                    else None
                ),
            ]
        )
    return rows


def build_figure_json(
    flows: list[CashFlow],
    actual_final_value: float,
    actual_metrics: Metrics,
    benchmark_results: dict[str, BenchmarkResult],
    benchmark_metrics: dict[str, Metrics],
) -> str:
    """Return a Plotly figure as a JSON string, ready to drop into `Plotly.newPlot`."""
    fig = make_subplots(
        rows=2,
        cols=1,
        row_heights=[0.7, 0.3],
        vertical_spacing=0.08,
        specs=[[{"type": "scatter"}], [{"type": "table"}]],
        subplot_titles=("Portfolio value over time", "Summary metrics"),
    )

    palette = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd"]
    for i, (ticker, bm) in enumerate(benchmark_results.items()):
        fig.add_trace(
            go.Scatter(
                x=list(bm.daily_value.index),
                y=list(bm.daily_value.values),
                mode="lines",
                name=f"Benchmark: {ticker}",
                line=dict(color=palette[i % len(palette)], width=2),
                hovertemplate="%{x|%Y-%m-%d}<br>$%{y:,.2f}<extra>"
                + ticker
                + "</extra>",
            ),
            row=1,
            col=1,
        )

    fig.add_trace(
        go.Scatter(
            x=[date.today()],
            y=[actual_final_value],
            mode="markers",
            name="Actual portfolio (today)",
            marker=dict(color="black", size=16, symbol="star"),
            hovertemplate="Today<br>$%{y:,.2f}<extra>Actual</extra>",
        ),
        row=1,
        col=1,
    )

    deposit_dates = [f.date for f in flows if f.amount > 0]
    deposit_amts = [f.amount for f in flows if f.amount > 0]
    if deposit_dates:
        fig.add_trace(
            go.Scatter(
                x=deposit_dates,
                y=[0] * len(deposit_dates),
                mode="markers",
                name="Deposits",
                marker=dict(
                    color="rgba(50,160,50,0.6)",
                    size=[max(6, min(22, 6 + (a / 1000))) for a in deposit_amts],
                    symbol="triangle-up",
                    line=dict(color="rgba(20,100,20,0.9)", width=1),
                ),
                hovertemplate="%{x|%Y-%m-%d}<br>Deposit: $%{customdata:,.2f}<extra></extra>",
                customdata=deposit_amts,
            ),
            row=1,
            col=1,
        )

    withdrawal_dates = [f.date for f in flows if f.amount < 0]
    withdrawal_amts = [-f.amount for f in flows if f.amount < 0]
    if withdrawal_dates:
        fig.add_trace(
            go.Scatter(
                x=withdrawal_dates,
                y=[0] * len(withdrawal_dates),
                mode="markers",
                name="Withdrawals",
                marker=dict(
                    color="rgba(200,50,50,0.6)",
                    size=[
                        max(6, min(22, 6 + (a / 1000))) for a in withdrawal_amts
                    ],
                    symbol="triangle-down",
                    line=dict(color="rgba(120,20,20,0.9)", width=1),
                ),
                hovertemplate="%{x|%Y-%m-%d}<br>Withdrawal: $%{customdata:,.2f}<extra></extra>",
                customdata=withdrawal_amts,
            ),
            row=1,
            col=1,
        )

    headers = [
        "Strategy",
        "Current value",
        "Gain ($)",
        "Total return",
        "CAGR",
        "XIRR",
        "Δ vs actual ($)",
        "Δ vs actual (%)",
    ]
    rows = _summary_rows(
        actual_metrics,
        {t: (benchmark_results[t], benchmark_metrics[t]) for t in benchmark_results},
    )
    columns = list(zip(*rows))

    fig.add_trace(
        go.Table(
            header=dict(
                values=headers,
                fill_color="#1f2937",
                font=dict(color="white", size=12),
                align="left",
            ),
            cells=dict(
                values=[list(col) for col in columns],
                fill_color="#f9fafb",
                align="left",
                font=dict(size=11),
                height=26,
            ),
        ),
        row=2,
        col=1,
    )

    fig.update_xaxes(title_text="Date", row=1, col=1)
    fig.update_yaxes(
        title_text="Portfolio value ($)", row=1, col=1, tickformat="$,.0f"
    )
    fig.update_layout(
        title=f"Robinhood actual vs. benchmark (as of {date.today().isoformat()})",
        height=900,
        hovermode="x unified",
        legend=dict(orientation="h", y=-0.05),
    )

    return fig.to_json()
