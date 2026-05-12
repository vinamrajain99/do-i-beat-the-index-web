"""Return-style metrics: CAGR and XIRR (money-weighted IRR).

Ported from the CLI on 2026-05-12. Only the relative import changed
(`worker.rh_parser` instead of `rh_parser`).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from scipy.optimize import brentq

from worker.rh_parser import CashFlow


@dataclass
class Metrics:
    total_deposited: float
    total_withdrawn: float
    net_invested: float
    final_value: float
    dollar_gain: float        # final_value - net_invested
    total_return_pct: float   # dollar_gain / net_invested
    cagr: float | None
    xirr: float | None


def _xirr(cash_flows: list[tuple[date, float]]) -> float | None:
    """Solve for r in: sum(amount_i / (1+r)^t_i) = 0 where t_i is years from earliest date.

    Sign convention for inputs (investor perspective):
      - Deposit into investment  -> NEGATIVE
      - Withdrawal from investment -> POSITIVE
      - Final holdings value     -> POSITIVE
    """
    if not cash_flows:
        return None
    amounts = [a for _, a in cash_flows]
    if not (any(a > 0 for a in amounts) and any(a < 0 for a in amounts)):
        return None

    t0 = min(d for d, _ in cash_flows)
    years = [(d - t0).days / 365.25 for d, _ in cash_flows]

    def npv(r: float) -> float:
        return sum(a / (1 + r) ** t for a, t in zip(amounts, years))

    try:
        return brentq(npv, -0.999, 100.0, xtol=1e-7)
    except ValueError:
        return None


def compute_metrics(flows: list[CashFlow], final_value: float) -> Metrics:
    total_deposited = sum(f.amount for f in flows if f.amount > 0)
    total_withdrawn = -sum(f.amount for f in flows if f.amount < 0)
    net_invested = total_deposited - total_withdrawn

    dollar_gain = final_value - net_invested
    total_return_pct = (
        dollar_gain / net_invested if net_invested > 0 else float("nan")
    )

    # CAGR using net invested and time span from first deposit
    cagr: float | None = None
    if flows and net_invested > 0 and final_value > 0:
        years = (date.today() - flows[0].date).days / 365.25
        if years > 0:
            cagr = (final_value / net_invested) ** (1 / years) - 1

    # XIRR: deposits as negative, withdrawals as positive, final value as positive
    xirr_flows: list[tuple[date, float]] = [(f.date, -f.amount) for f in flows]
    xirr_flows.append((date.today(), final_value))
    xirr_val = _xirr(xirr_flows)

    return Metrics(
        total_deposited=total_deposited,
        total_withdrawn=total_withdrawn,
        net_invested=net_invested,
        final_value=final_value,
        dollar_gain=dollar_gain,
        total_return_pct=total_return_pct,
        cagr=cagr,
        xirr=xirr_val,
    )
