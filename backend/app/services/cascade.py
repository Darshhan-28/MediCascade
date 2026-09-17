"""Cascade simulation + interventions. Deterministic, NetworkX-based reachability."""
from __future__ import annotations
import networkx as nx
from .risk import compute_risk

def build_graph(network: dict) -> nx.DiGraph:
    g = nx.DiGraph()
    for n in network["nodes"]:
        g.add_node(n["id"], kind=n.get("kind", "hospital"))
    for e in network["edges"]:
        g.add_edge(e["from"], e["to"], relationship=e.get("relationship", "supply"))
    return g

def downstream_of(g: nx.DiGraph, source: str) -> set:
    if source not in g:
        return set()
    return set(nx.descendants(g, source)) | {source}

def facility_risks(data: dict, disruption_supplier: str | None = None,
                   delay_days: float = 0, demand_surge_pct: float = 0,
                   overrides: dict | None = None) -> dict:
    """overrides: {(facility_id, medicine_id): {stock, eta, supplier_id}}"""
    overrides = overrides or {}
    g = build_graph(data["network"])
    affected = downstream_of(g, disruption_supplier) if disruption_supplier and delay_days else set()
    sup_by_id = {s["id"]: s for s in data["suppliers"]}
    # count alternative supply routes per facility (redistribution in-edges)
    alt_counts: dict[str, int] = {}
    for e in data["network"]["edges"]:
        if e.get("relationship") == "redistribution":
            alt_counts[e["to"]] = alt_counts.get(e["to"], 0) + 1
    # facilities on beta get +1 alt implicitly
    results = {}
    meta: dict = {}
    for inv in data["inventory"]:
        key = (inv["facility_id"], inv["medicine_id"])
        ov = overrides.get(key, {})
        stock = ov.get("stock", inv["current_stock"])
        eta = ov.get("eta", inv["replenishment_eta_days"])
        sup_id = ov.get("supplier_id", inv["supplier_id"])
        cons = inv["daily_consumption"] * (1 + demand_surge_pct / 100.0) if inv["medicine_id"] == "m_amox" else inv["daily_consumption"]
        disrupted = bool(disruption_supplier and delay_days and sup_id == disruption_supplier
                         and inv["facility_id"] in affected)
        if disrupted:
            eta = eta + delay_days
        sup = sup_by_id.get(sup_id, {"reliability_score": 0.8})
        fac = next((f for f in data["facilities"] if f["id"] == inv["facility_id"]), {})
        single = sup_id in ("s_alpha", "s_gamma")
        alt = alt_counts.get(inv["facility_id"], 0) + (1 if sup_id == "s_beta" else 0) + 1  # +1 CDC path
        r = compute_risk(stock, cons, eta, inv["safety_stock_days"], disrupted, single,
                         sup.get("reliability_score", 0.8), alt, demand_surge_pct)
        r.update({"facility_id": inv["facility_id"], "medicine_id": inv["medicine_id"],
                  "stock": stock, "daily_consumption": round(cons, 1), "eta_days": eta,
                  "supplier_id": sup_id, "disrupted": disrupted,
                  "alt_routes": alt, "safety_stock_days": inv["safety_stock_days"]})
        results[key] = r
        meta[key] = {"alt": alt, "single": single,
                     "redist_capacity": fac.get("redistribution_capacity", 0) if isinstance(fac, dict) else 0}
    surplus_ids = {r["facility_id"] for r in results.values()
                   if r["medicine_id"] == "m_amox" and r["gap_days"] < -2 and r["state"] == "stable"}
    for key, r in results.items():
        m = meta[key]
        nearby = bool(surplus_ids - {r["facility_id"]})
        r["resilience"] = resilience(r["facility_id"], m["alt"], single_source=(r["supplier_id"] in ("s_alpha", "s_gamma")),
                                     gap_days=r["gap_days"], redist_capacity=m["redist_capacity"],
                                     nearby_surplus=nearby)
    return results

def regional_exposure(risks: dict, medicine_id: str = "m_amox") -> dict:
    rel = [r for (f, m), r in risks.items() if m == medicine_id]
    n = max(len(rel), 1)
    high = sum(1 for r in rel if r["state"] == "high")
    vuln = sum(1 for r in rel if r["state"] == "vulnerable")
    pct = (high + 0.5 * vuln) / n * 100
    label = "Low" if pct < 15 else "Moderate" if pct < 35 else "High" if pct < 60 else "Critical"
    return {"high": high, "vulnerable": vuln, "total": len(rel), "score": round(pct, 1), "label": label}

def build_timeline(risks_before: dict, risks_after: dict, delay_days: float) -> list:
    tl = [{"day": 0, "event": f"Supplier disruption: +{delay_days:g}-day delay detected"}]
    worst_gap = 0
    for key, after in risks_after.items():
        before = risks_before.get(key)
        if not before or after["medicine_id"] != "m_amox":
            continue
        if after["state"] != before["state"]:
            f = after["facility_id"]
            gap = after["gap_days"]
            worst_gap = max(worst_gap, gap)
            d1 = max(1, int(round(gap / 2)))
            d2 = max(d1 + 1, int(round(gap)))
            tl.append({"day": d1, "event": f"Inventory pressure begins at {f} (coverage {after['coverage_days']:.1f}d)"})
            tl.append({"day": d2, "event": f"{f} enters {after['state'].upper()} state (gap {gap:+.1f}d)"})
    tl.append({"day": int(round(max(worst_gap, delay_days))), "event": "Regional exposure reassessed"})
    tl.sort(key=lambda x: x["day"])
    # dedupe same-day
    seen, out = set(), []
    for t in tl:
        if (t["day"], t["event"]) not in seen:
            out.append(t); seen.add((t["day"], t["event"]))
    return out[:8]

def build_alerts(risks_after: dict, risks_before: dict, disruption_supplier: str | None, delay_days: float) -> list:
    alerts = []
    if disruption_supplier and delay_days:
        alerts.append({"level": "disruption", "title": "SUPPLIER DISRUPTION",
                       "detail": f"{disruption_supplier}: +{delay_days:g}-day replenishment delay detected.",
                       "why": "Upstream lead time increased; downstream ETAs extended by the same delay."})
    for key, after in risks_after.items():
        before = risks_before.get(key)
        if after["medicine_id"] != "m_amox":
            continue
        if after["state"] == "high":
            alerts.append({"level": "high", "title": "HIGH RISK",
                           "detail": f"{after['facility_id']}: stock coverage below replenishment window.",
                           "why": after["why"]})
        elif before and after["state"] != before["state"] and after["state"] == "vulnerable":
            alerts.append({"level": "cascade", "title": "CASCADE ALERT",
                           "detail": f"{after['facility_id']}: risk increased due to upstream supplier disruption.",
                           "why": after["why"]})
        if after["gap_days"] < -2 and after["state"] == "stable":
            alerts.append({"level": "surplus", "title": "SURPLUS OPPORTUNITY",
                           "detail": f"{after['facility_id']}: {abs(after['gap_days']):.0f} days of excess coverage detected.",
                           "why": "Coverage exceeds replenishment + safety buffer. Potential redistribution candidate."})
    return alerts

def surplus_list(risks_after: dict) -> list:
    return [{"facility_id": r["facility_id"], "excess_days": round(-r["gap_days"], 1), "stock": r["stock"]}
            for r in risks_after.values()
            if r["medicine_id"] == "m_amox" and r["gap_days"] < -2 and r["state"] == "stable"]

def resilience(facility_id: str, alt_count: int, single_source: bool, gap_days: float,
               redist_capacity: int = 0, nearby_surplus: bool = False) -> dict:
    """Network resilience from existing graph/inventory inputs only. No invented data."""
    factors: list[str] = []
    level = 0  # 0 LOW, 1 MEDIUM, 2 HIGH
    if alt_count >= 3:
        level += 1; factors.append(f"{alt_count} alternative routes")
    else:
        factors.append(f"only {alt_count} alternative route(s)")
    if not single_source:
        level += 1; factors.append("multi-supplier sourcing")
    else:
        factors.append("single-source dependency")
    if gap_days < -2:
        level += 1; factors.append(f"{abs(gap_days):.1f}d buffer beyond replenishment")
    elif gap_days > 2:
        level -= 1; factors.append(f"coverage gap of +{gap_days:.1f}d")
    if redist_capacity >= 1000:
        level += 1; factors.append(f"redistribution capacity {redist_capacity} units")
    if nearby_surplus:
        level += 1; factors.append("surplus available in network")
    level = max(0, min(2, level))
    state = ["LOW", "MEDIUM", "HIGH"][level]
    return {"state": state, "factors": factors}

def critical_nodes(data: dict, medicine_id: str = "m_amox") -> list:
    """Suppliers ranked by direct facility dependency (inventory sourcing).

    Graph descendants via the shared CDC reach the whole region for every
    supplier, so the defensible cascade metric is direct dependency: distinct
    facilities sourcing the focus medicine from each supplier.
    """
    g = build_graph(data["network"])
    fac_ids = {f["id"] for f in data["facilities"]}
    out = []
    for s in data["suppliers"]:
        dependents = sorted({i["facility_id"] for i in data["inventory"]
                             if i["medicine_id"] == medicine_id and i["supplier_id"] == s["id"]})
        graph_reach = len(downstream_of(g, s["id"]) & fac_ids)
        n = len(dependents)
        out.append({"node_id": s["id"], "name": s["name"],
                    "downstream_facilities": n, "reach": dependents,
                    "sole_dependency_count": n, "network_reach": graph_reach,
                    "alternative_supply": "Limited" if n >= 3 else "Partial" if n >= 1 else "Available"})
    out.sort(key=lambda x: -x["downstream_facilities"])
    return out
