"""Deterministic risk engine — mirrored in frontend localEngine.ts. Keep formulas in sync."""
from __future__ import annotations

def risk_state(score: float) -> str:
    if score >= 61:
        return "high"
    if score >= 31:
        return "vulnerable"
    return "stable"

def compute_risk(current_stock: float, daily_consumption: float, eta_days: float,
                 safety_days: float, supplier_disrupted: bool, single_source: bool,
                 reliability: float, alt_supply_count: int, demand_trend_pct: float = 0.0) -> dict:
    coverage = current_stock / max(daily_consumption, 1e-6)
    gap = eta_days - coverage
    # coverage component
    if coverage < 3: w_cover = 35
    elif coverage < 5: w_cover = 25
    elif coverage < 8: w_cover = 15
    elif coverage < 12: w_cover = 5
    else: w_cover = -10
    # gap component
    if gap > 4: w_gap = 30
    elif gap > 2: w_gap = 20
    elif gap > 0: w_gap = 12
    elif gap > -2: w_gap = 0
    else: w_gap = -10
    # supplier component
    w_supplier = 0
    if supplier_disrupted: w_supplier += 20
    if single_source: w_supplier += 6
    if reliability < 0.85: w_supplier += 4
    # network component
    w_network = 0
    if alt_supply_count <= 1: w_network += 8
    elif alt_supply_count == 2: w_network += 3
    if demand_trend_pct > 10: w_network += 5
    elif demand_trend_pct > 0: w_network += 2
    score = max(0, min(100, w_cover + w_gap + w_supplier + w_network))
    state = risk_state(score)
    if state == "high":
        why = (f"Stock covers {coverage:.1f}d vs {eta_days:.0f}d replenishment "
               f"(gap {gap:+.1f}d) with safety threshold {safety_days:.0f}d. "
               f"Depends on a {'disrupted ' if supplier_disrupted else ''}single-source supplier "
               f"with {alt_supply_count} alternative route(s).")
    elif state == "vulnerable":
        why = (f"Coverage {coverage:.1f}d is tight against {eta_days:.0f}d replenishment "
               f"(gap {gap:+.1f}d). Monitor supplier and redistribution options.")
    else:
        why = (f"Coverage {coverage:.1f}d comfortably exceeds {eta_days:.0f}d replenishment. Buffer intact.")
    return {"score": round(score, 1), "state": state, "coverage_days": round(coverage, 2),
            "gap_days": round(gap, 2), "factors": {"cover": w_cover, "gap": w_gap,
            "supplier": w_supplier, "network": w_network}, "why": why}
