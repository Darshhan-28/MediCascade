"""MediCascade FastAPI backend — authoritative simulation engine."""
from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.services.loader import load_all
from app.services.cascade import (facility_risks, regional_exposure, build_timeline, build_alerts, surplus_list, build_graph, downstream_of, critical_nodes)
from app.services.forecast import predict_pair

app = FastAPI(title="MediCascade API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class SimulateIn(BaseModel):
    supplier_id: str = "s_alpha"
    delay_days: float = 7
    medicine_id: str = "m_amox"
    demand_change_pct: float = 0

class InterventionIn(BaseModel):
    type: str = "none"  # none | redistribute | alt_supplier
    from_facility: str = "hB"
    to_facility: str = "hA"
    medicine_id: str = "m_amox"
    units: float = 1500
    supplier_id: str = "s_alpha"
    delay_days: float = 7
    demand_change_pct: float = 0

def _risks_payload(risks: dict) -> list:
    return sorted(risks.values(), key=lambda r: (r["medicine_id"], r["facility_id"]))

@app.get("/api/facilities")
def facilities(): return load_all()["facilities"]

@app.get("/api/medicines")
def medicines(): return load_all()["medicines"]

@app.get("/api/suppliers")
def suppliers(): return load_all()["suppliers"]

@app.get("/api/network")
def network(): return load_all()["network"]

@app.get("/api/risks")
def risks():
    data = load_all()
    r = facility_risks(data)
    return {"risks": _risks_payload(r), "regional": regional_exposure(r), "note": "Synthetic demo data"}

@app.get("/api/alerts")
def alerts():
    data = load_all()
    r = facility_risks(data)
    return {"alerts": build_alerts(r, r, None, 0), "note": "Synthetic demo data"}

@app.post("/api/simulate")
def simulate(inp: SimulateIn):
    data = load_all()
    before = facility_risks(data)
    after = facility_risks(data, inp.supplier_id, inp.delay_days, inp.demand_change_pct)
    g = build_graph(data["network"])
    aff = sorted(downstream_of(g, inp.supplier_id)) if inp.delay_days else []
    return {"before": _risks_payload(before), "after": _risks_payload(after),
            "regional_before": regional_exposure(before, inp.medicine_id),
            "regional_after": regional_exposure(after, inp.medicine_id),
            "timeline": build_timeline(before, after, inp.delay_days),
            "affected_nodes": aff, "surplus": surplus_list(after),
            "alerts": build_alerts(after, before, inp.supplier_id, inp.delay_days),
            "critical": critical_nodes(data, inp.medicine_id),
            "note": "Synthetic demo data. Decision support only — humans remain in control."}

@app.post("/api/intervention")
def intervention(inp: InterventionIn):
    data = load_all()
    base_after = facility_risks(data, inp.supplier_id, inp.delay_days, inp.demand_change_pct)
    base_reg = regional_exposure(base_after, inp.medicine_id)
    out: dict = {"baseline": {"risks": _risks_payload(base_after), "regional": base_reg}}
    if inp.type == "redistribute":
        ov = {(inp.to_facility, inp.medicine_id): None}
        # compute current stocks
        cur = {(i["facility_id"], i["medicine_id"]): i for i in data["inventory"]}
        a = cur[(inp.to_facility, inp.medicine_id)]; b = cur[(inp.from_facility, inp.medicine_id)]
        move = min(inp.units, b["current_stock"] * 0.5)
        overrides = {(inp.to_facility, inp.medicine_id): {"stock": a["current_stock"] + move},
                     (inp.from_facility, inp.medicine_id): {"stock": b["current_stock"] - move}}
        r = facility_risks(data, inp.supplier_id, inp.delay_days, inp.demand_change_pct, overrides)
        out["intervention"] = {"risks": _risks_payload(r), "regional": regional_exposure(r, inp.medicine_id),
                               "moved_units": move, "tradeoff": {
                                   f"{inp.from_facility}_before": base_after[(inp.from_facility, inp.medicine_id)]["coverage_days"],
                                   f"{inp.from_facility}_after": r[(inp.from_facility, inp.medicine_id)]["coverage_days"],
                                   f"{inp.to_facility}_before": base_after[(inp.to_facility, inp.medicine_id)]["coverage_days"],
                                   f"{inp.to_facility}_after": r[(inp.to_facility, inp.medicine_id)]["coverage_days"]}}
    elif inp.type == "alt_supplier":
        cur = {(i["facility_id"], i["medicine_id"]): i for i in data["inventory"]}
        a = cur[(inp.to_facility, inp.medicine_id)]
        overrides = {(inp.to_facility, inp.medicine_id): {"supplier_id": "s_beta", "eta": a["replenishment_eta_days"] + 1}}
        r = facility_risks(data, inp.supplier_id, inp.delay_days, inp.demand_change_pct, overrides)
        out["intervention"] = {"risks": _risks_payload(r), "regional": regional_exposure(r, inp.medicine_id),
                               "tradeoff": {f"{inp.to_facility}_before": base_after[(inp.to_facility, inp.medicine_id)]["score"],
                                            f"{inp.to_facility}_after": r[(inp.to_facility, inp.medicine_id)]["score"]}}
    out["note"] = "Simulated comparison — human decision required. Synthetic demo data."
    return out

@app.post("/api/reset")
def reset(): return {"status": "reset", "note": "Stateless prototype — client clears scenario params."}

@app.get("/api/forecast")
def forecast(facility_id: str = "hA", medicine_id: str = "m_amox", horizon: int = 7):
    """ML demand forecast only. Never sets risk/cascade/interventions.

    Always returns 200 — on any failure degrades to a labeled naive estimate
    so the core demo can never break.
    """
    try:
        data = load_all()
        inv = next((i for i in data["inventory"]
                    if i["facility_id"] == facility_id and i["medicine_id"] == medicine_id), None)
        if inv is None:
            return {"error": "unknown facility/medicine pair", "model": "none"}
        p = predict_pair(facility_id, medicine_id, horizon)
        stock, cons = inv["current_stock"], inv["daily_consumption"]
        return {"facility_id": facility_id, "medicine_id": medicine_id,
                "current_consumption": cons, "current_stock": stock,
                "current_coverage_days": round(stock / max(cons, 1e-6), 2),
                "predicted_daily": p["predicted_daily"], "horizon_days": len(p["daily"]),
                "daily_forecast": p["daily"],
                "forecast_coverage_days": round(stock / max(p["predicted_daily"], 1e-6), 2),
                "mae": p["mae"], "naive_mae": p["naive_mae"], "model": p["model"],
                "n_train": p["n_train"], "n_test": p["n_test"],
                "data_source": "Synthetic historical demonstration data — NOT real hospital data",
                "note": "ML predicts demand only; the deterministic risk engine evaluates shortage risk."}
    except Exception as exc:
        return {"facility_id": facility_id, "medicine_id": medicine_id, "error": str(exc),
                "model": "unavailable", "data_source": "Synthetic historical demonstration data"}
