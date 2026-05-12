"""Build the comparison Plotly figure as JSON for the web frontend to rehydrate.

Single chart only — the metrics table is rendered as native HTML in the
frontend (`src/app/dashboard/[id]/results-summary.tsx`), not baked into the
figure.
"""

from __future__ import annotations

from datetime import date

import plotly.graph_objects as go

from worker.benchmark import BenchmarkResult
from worker.metrics import Metrics
from worker.rh_parser import CashFlow


# Visual tokens ----------------------------------------------------------------

_FONT_FAMILY = (
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "
    "'Segoe UI', Roboto, sans-serif"
)

# Tailwind-ish modern palette for benchmark lines. Cycled by index.
_BENCHMARK_PALETTE = [
    "#2563eb",  # blue-600
    "#f59e0b",  # amber-500
    "#10b981",  # emerald-500
    "#ec4899",  # pink-500
    "#8b5cf6",  # violet-500
]

_COLOR_ACTUAL = "#0f172a"            # slate-900
_COLOR_DEPOSIT = "#16a34a"           # green-600
_COLOR_DEPOSIT_FILL = "rgba(22,163,74,0.55)"
_COLOR_WITHDRAWAL = "#dc2626"        # red-600
_COLOR_WITHDRAWAL_FILL = "rgba(220,38,38,0.55)"
_COLOR_GRID = "rgba(15,23,42,0.07)"  # slate-900 @ 7%
_COLOR_AXIS_TEXT = "#475569"         # slate-600
_COLOR_MUTED = "#94a3b8"             # slate-400


def build_figure_json(
    flows: list[CashFlow],
    actual_final_value: float,
    actual_metrics: Metrics,
    benchmark_results: dict[str, BenchmarkResult],
    benchmark_metrics: dict[str, Metrics],
) -> str:
    """Return a Plotly figure as a JSON string, ready to drop into `Plotly.newPlot`."""
    # `actual_metrics` and `benchmark_metrics` are passed in for parity with
    # the CLI signature, but the table that consumed them has moved to the
    # frontend. Keep the parameters so callers don't need to change.
    del actual_metrics, benchmark_metrics

    fig = go.Figure()

    # Benchmark lines.
    for i, (ticker, bm) in enumerate(benchmark_results.items()):
        color = _BENCHMARK_PALETTE[i % len(_BENCHMARK_PALETTE)]
        fig.add_trace(
            go.Scatter(
                x=list(bm.daily_value.index),
                y=list(bm.daily_value.values),
                mode="lines",
                name=ticker,
                line=dict(color=color, width=2.5),
                hovertemplate="<b>%{x|%b %d, %Y}</b><br>$%{y:,.0f}<extra>"
                + ticker
                + "</extra>",
            )
        )

    # Actual portfolio "today" marker.
    fig.add_trace(
        go.Scatter(
            x=[date.today()],
            y=[actual_final_value],
            mode="markers",
            name="Your portfolio (today)",
            marker=dict(
                color=_COLOR_ACTUAL,
                size=18,
                symbol="star",
                line=dict(color="white", width=2),
            ),
            hovertemplate="<b>Today</b><br>$%{y:,.0f}<extra>Your portfolio</extra>",
        )
    )

    # Deposit triangles, sized (gently) by amount.
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
                    color=_COLOR_DEPOSIT_FILL,
                    size=[max(5, min(11, 5 + (a / 3000))) for a in deposit_amts],
                    symbol="triangle-up",
                    line=dict(color=_COLOR_DEPOSIT, width=1),
                ),
                hovertemplate="<b>%{x|%b %d, %Y}</b><br>Deposit: $%{customdata:,.0f}<extra></extra>",
                customdata=deposit_amts,
            )
        )

    # Withdrawal triangles (only shown when there are any).
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
                    color=_COLOR_WITHDRAWAL_FILL,
                    size=[max(5, min(11, 5 + (a / 3000))) for a in withdrawal_amts],
                    symbol="triangle-down",
                    line=dict(color=_COLOR_WITHDRAWAL, width=1),
                ),
                hovertemplate="<b>%{x|%b %d, %Y}</b><br>Withdrawal: $%{customdata:,.0f}<extra></extra>",
                customdata=withdrawal_amts,
            )
        )

    # Axes ---------------------------------------------------------------------
    fig.update_xaxes(
        showgrid=True,
        gridcolor=_COLOR_GRID,
        gridwidth=1,
        zeroline=False,
        showline=False,
        ticks="outside",
        ticklen=4,
        tickcolor=_COLOR_MUTED,
        tickfont=dict(family=_FONT_FAMILY, size=12, color=_COLOR_AXIS_TEXT),
    )
    fig.update_yaxes(
        title=dict(
            text="Portfolio value",
            font=dict(family=_FONT_FAMILY, size=13, color=_COLOR_AXIS_TEXT),
            standoff=12,
        ),
        showgrid=True,
        gridcolor=_COLOR_GRID,
        gridwidth=1,
        zeroline=True,
        zerolinecolor=_COLOR_GRID,
        zerolinewidth=1,
        showline=False,
        ticks="outside",
        ticklen=4,
        tickcolor=_COLOR_MUTED,
        tickfont=dict(family=_FONT_FAMILY, size=12, color=_COLOR_AXIS_TEXT),
        tickprefix="$",
        tickformat="~s",   # SI suffix (k, M) with trailing zeros trimmed
        separatethousands=True,
    )

    # Title --------------------------------------------------------------------
    today_pretty = date.today().strftime("%B %-d, %Y")
    fig.update_layout(
        title=dict(
            text=(
                "<b style='font-size:18px;color:#0f172a'>Portfolio vs. benchmark over time</b>"
                f"<br><span style='font-size:12px;color:#64748b;font-weight:400'>As of {today_pretty}</span>"
            ),
            x=0.0,
            xanchor="left",
            y=0.96,
            yanchor="top",
            pad=dict(l=8, t=4),
        ),
        height=600,
        font=dict(family=_FONT_FAMILY, color=_COLOR_AXIS_TEXT),
        plot_bgcolor="white",
        paper_bgcolor="white",
        hovermode="x unified",
        hoverlabel=dict(
            bgcolor="white",
            bordercolor=_COLOR_GRID,
            font=dict(family=_FONT_FAMILY, size=12, color="#0f172a"),
            namelength=-1,
        ),
        legend=dict(
            orientation="h",
            x=0.5,
            xanchor="center",
            y=-0.14,
            yanchor="top",
            bgcolor="rgba(0,0,0,0)",
            bordercolor="rgba(0,0,0,0)",
            font=dict(family=_FONT_FAMILY, size=12, color=_COLOR_AXIS_TEXT),
            itemsizing="constant",
        ),
        margin=dict(l=60, r=24, t=88, b=72),
    )

    return fig.to_json()
