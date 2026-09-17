import type { FacilityRisk, SimulateResult } from "../types";
import { buildAlerts, buildTimeline, criticalNodes, facilityRisks, regionalExposure } from "./localEngine";
import { INVENTORY } from "../data/synthetic";

const API = "http://localhost:8000";
async function tryFetch<T>(path: string, init?: RequestInit, timeoutMs = 2500): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${API}${path}`, { ...init, signal: ctrl.signal, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

interface SimApi { before: FacilityRisk[]; after: FacilityRisk[]; regional_before: SimulateResult["regional_before"]; regional_after: SimulateResult["regional_after"]; timeline: SimulateResult["timeline"]; affected_nodes: string[]; surplus: SimulateResult["surplus"]; alerts: SimulateResult["alerts"]; critical?: SimulateResult["critical"]; }

export async function simulate(supplier_id: string, delay_days: number, medicine_id: string, demand_change_pct: number): Promise<SimulateResult> {
  const api = await tryFetch<SimApi>("/api/simulate", { method: "POST", body: JSON.stringify({ supplier_id, delay_days, medicine_id, demand_change_pct }) });
  if (api) return { ...api, critical: api.critical ?? criticalNodes(medicine_id), engine: "api" };
  const before = facilityRisks(null, 0, 0);
  const after = facilityRisks(supplier_id || null, delay_days, demand_change_pct);
  const list = (r: Record<string, FacilityRisk>) => Object.values(r);
  return {
    before: list(before), after: list(after),
    regional_before: regionalExposure(before, medicine_id), regional_after: regionalExposure(after, medicine_id),
    timeline: buildTimeline(before, after, delay_days),
    affected_nodes: supplier_id && delay_days ? Object.values(after).filter((r) => r.disrupted).map((r) => r.facility_id) : [],
    surplus: Object.values(after).filter((r) => r.medicine_id === medicine_id && r.gap_days < -2 && r.state === "stable")
      .map((r) => ({ facility_id: r.facility_id, excess_days: Math.round(-r.gap_days * 10) / 10, stock: r.stock })),
    alerts: buildAlerts(after, before, supplier_id, delay_days),
    critical: criticalNodes(medicine_id),
    engine: "local",
  };
}

export async function baseline(): Promise<SimulateResult> {
  return simulate("s_alpha", 0, "m_amox", 0);
}

export async function intervene(kind: "redistribute" | "alt_supplier", scenario: { delay: number; demand: number; units?: number }): Promise<{ moved?: number; after: FacilityRisk[]; regional: SimulateResult["regional_after"]; tradeoff: Record<string, number> }> {
  const api = await tryFetch<{ intervention: { risks: FacilityRisk[]; regional: SimulateResult["regional_after"]; moved_units?: number; tradeoff: Record<string, number> } }>(
    "/api/intervention", { method: "POST", body: JSON.stringify(kind === "redistribute"
      ? { type: "redistribute", from_facility: "hB", to_facility: "hA", medicine_id: "m_amox", units: scenario.units ?? 1500, supplier_id: "s_alpha", delay_days: scenario.delay, demand_change_pct: scenario.demand }
      : { type: "alt_supplier", to_facility: "hA", medicine_id: "m_amox", supplier_id: "s_alpha", delay_days: scenario.delay, demand_change_pct: scenario.demand }) });
  if (api?.intervention) return { moved: api.intervention.moved_units, after: api.intervention.risks, regional: api.intervention.regional, tradeoff: api.intervention.tradeoff };
  // local mirror
  const cur = Object.fromEntries(INVENTORY.map((i) => [`${i.facility_id}|${i.medicine_id}`, i]));
  const baseAfter = facilityRisks("s_alpha", scenario.delay, scenario.demand);
  const get = (f: string) => baseAfter[`${f}|m_amox`];
  if (kind === "redistribute") {
    const move = Math.min(scenario.units ?? 1500, cur["hB|m_amox"].current_stock * 0.5);
    const r = facilityRisks("s_alpha", scenario.delay, scenario.demand, {
      "hA|m_amox": { stock: cur["hA|m_amox"].current_stock + move },
      "hB|m_amox": { stock: cur["hB|m_amox"].current_stock - move },
    });
    return { moved: move, after: Object.values(r), regional: regionalExposure(r), tradeoff: { hB_before: get("hB").coverage_days, hB_after: r["hB|m_amox"].coverage_days, hA_before: get("hA").coverage_days, hA_after: r["hA|m_amox"].coverage_days } };
  }
  const r = facilityRisks("s_alpha", scenario.delay, scenario.demand, { "hA|m_amox": { supplier_id: "s_beta", eta: cur["hA|m_amox"].replenishment_eta_days + 1 } });
  return { after: Object.values(r), regional: regionalExposure(r), tradeoff: { hA_before: get("hA").score, hA_after: r["hA|m_amox"].score } };
}

export async function pingBackend(): Promise<boolean> {
  return (await tryFetch("/api/suppliers", undefined, 1500)) !== null;
}
