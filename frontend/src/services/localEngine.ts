// Deterministic mirror of backend/app/services/risk.py + cascade.py — keep formulas in sync.
import type { AlertItem, CriticalNode, FacilityRisk, Regional, Resilience, RiskState, TimelineStep } from "../types";
import { FACILITIES, INVENTORY, NETWORK, SUPPLIERS } from "../data/synthetic";

export function riskState(score: number): RiskState {
  if (score >= 61) return "high";
  if (score >= 31) return "vulnerable";
  return "stable";
}

export function computeRisk(stock: number, cons: number, eta: number, safety: number,
  disrupted: boolean, single: boolean, reliability: number, alt: number, trend = 0) {
  const coverage = stock / Math.max(cons, 1e-6);
  const gap = eta - coverage;
  let wCover: number;
  if (coverage < 3) wCover = 35; else if (coverage < 5) wCover = 25;
  else if (coverage < 8) wCover = 15; else if (coverage < 12) wCover = 5; else wCover = -10;
  let wGap: number;
  if (gap > 4) wGap = 30; else if (gap > 2) wGap = 20; else if (gap > 0) wGap = 12;
  else if (gap > -2) wGap = 0; else wGap = -10;
  let wSup = 0;
  if (disrupted) wSup += 20;
  if (single) wSup += 6;
  if (reliability < 0.85) wSup += 4;
  let wNet = 0;
  if (alt <= 1) wNet += 8; else if (alt === 2) wNet += 3;
  if (trend > 10) wNet += 5; else if (trend > 0) wNet += 2;
  const score = Math.max(0, Math.min(100, wCover + wGap + wSup + wNet));
  const state = riskState(score);
  const why = state === "high"
    ? `Stock covers ${coverage.toFixed(1)}d vs ${eta.toFixed(0)}d replenishment (gap ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}d) with safety threshold ${safety.toFixed(0)}d. Depends on a ${disrupted ? "disrupted " : ""}single-source supplier with ${alt} alternative route(s).`
    : state === "vulnerable"
      ? `Coverage ${coverage.toFixed(1)}d is tight against ${eta.toFixed(0)}d replenishment (gap ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}d). Monitor supplier and redistribution options.`
      : `Coverage ${coverage.toFixed(1)}d comfortably exceeds ${eta.toFixed(0)}d replenishment. Buffer intact.`;
  return { score: Math.round(score * 10) / 10, state, coverage, gap, factors: { cover: wCover, gap: wGap, supplier: wSup, network: wNet }, why };
}

function downstream(source: string): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of NETWORK.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const seen = new Set<string>([source]);
  const stack = [source];
  while (stack.length) {
    const n = stack.pop()!;
    for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); stack.push(m); }
  }
  return seen;
}

export type Override = { stock?: number; eta?: number; supplier_id?: string };

export function facilityRisks(disruptionSupplier: string | null = null, delayDays = 0,
  demandSurge = 0, overrides: Record<string, Override> = {}): Record<string, FacilityRisk> {
  const affected = disruptionSupplier && delayDays ? downstream(disruptionSupplier) : new Set<string>();
  const supById = Object.fromEntries(SUPPLIERS.map((s) => [s.id, s]));
  const altIn: Record<string, number> = {};
  for (const e of NETWORK.edges) if (e.relationship === "redistribution") altIn[e.to] = (altIn[e.to] ?? 0) + 1;
  const out: Record<string, FacilityRisk> = {};
  const meta: Record<string, { alt: number; redist: number }> = {};
  for (const inv of INVENTORY) {
    const key = `${inv.facility_id}|${inv.medicine_id}`;
    const ov = overrides[key] ?? {};
    const stock = ov.stock ?? inv.current_stock;
    let eta = ov.eta ?? inv.replenishment_eta_days;
    const supId = ov.supplier_id ?? inv.supplier_id;
    const cons = inv.medicine_id === "m_amox" ? inv.daily_consumption * (1 + demandSurge / 100) : inv.daily_consumption;
    const disrupted = !!(disruptionSupplier && delayDays && supId === disruptionSupplier && affected.has(inv.facility_id));
    if (disrupted) eta += delayDays;
    const sup = supById[supId] ?? { reliability_score: 0.8 };
    const single = supId === "s_alpha" || supId === "s_gamma";
    const alt = (altIn[inv.facility_id] ?? 0) + (supId === "s_beta" ? 1 : 0) + 1;
    const r = computeRisk(stock, cons, eta, inv.safety_stock_days, disrupted, single, sup.reliability_score, alt, demandSurge);
    out[key] = { facility_id: inv.facility_id, medicine_id: inv.medicine_id, stock, daily_consumption: Math.round(cons * 10) / 10, eta_days: eta, supplier_id: supId, disrupted, score: r.score, state: r.state, coverage_days: Math.round(r.coverage * 100) / 100, gap_days: Math.round(r.gap * 100) / 100, factors: r.factors, why: r.why, alt_routes: alt, safety_stock_days: inv.safety_stock_days, resilience: { state: "MEDIUM", factors: [] } };
    meta[key] = { alt, redist: FACILITIES.find((f) => f.id === inv.facility_id)?.redistribution_capacity ?? 0 };
  }
  const surplusIds = new Set(Object.values(out).filter((r) => r.medicine_id === "m_amox" && r.gap_days < -2 && r.state === "stable").map((r) => r.facility_id));
  for (const [key, r] of Object.entries(out)) {
    const m = meta[key];
    r.resilience = resilience(r.facility_id, m.alt, r.supplier_id === "s_alpha" || r.supplier_id === "s_gamma", r.gap_days, m.redist, surplusIds.has(r.facility_id) ? surplusIds.size > 1 : surplusIds.size > 0);
  }
  return out;
}

export function resilience(_facilityId: string, altCount: number, singleSource: boolean, gapDays: number, redistCapacity = 0, nearbySurplus = false): Resilience {
  const factors: string[] = [];
  let level = 0;
  if (altCount >= 3) { level += 1; factors.push(`${altCount} alternative routes`); }
  else factors.push(`only ${altCount} alternative route(s)`);
  if (!singleSource) { level += 1; factors.push("multi-supplier sourcing"); }
  else factors.push("single-source dependency");
  if (gapDays < -2) { level += 1; factors.push(`${Math.abs(gapDays).toFixed(1)}d buffer beyond replenishment`); }
  else if (gapDays > 2) { level -= 1; factors.push(`coverage gap of +${gapDays.toFixed(1)}d`); }
  if (redistCapacity >= 1000) { level += 1; factors.push(`redistribution capacity ${redistCapacity} units`); }
  if (nearbySurplus) { level += 1; factors.push("surplus available in network"); }
  level = Math.max(0, Math.min(2, level));
  return { state: (["LOW", "MEDIUM", "HIGH"] as const)[level], factors };
}

export function criticalNodes(med = "m_amox"): CriticalNode[] {
  const out = SUPPLIERS.map((s) => {
    const dependents = [...new Set(INVENTORY.filter((i) => i.medicine_id === med && i.supplier_id === s.id).map((i) => i.facility_id))].sort();
    // graph reach via shared CDC covers the region for every supplier; direct dependency is the cascade metric
    let reach = 0;
    const adj = new Map<string, string[]>();
    for (const e of NETWORK.edges) { if (!adj.has(e.from)) adj.set(e.from, []); adj.get(e.from)!.push(e.to); }
    const seen = new Set([s.id]); const stack = [s.id];
    while (stack.length) { const n = stack.pop()!; for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); stack.push(m); } }
    reach = [...seen].filter((id) => FACILITIES.some((f) => f.id === id)).length;
    const n = dependents.length;
    return { node_id: s.id, name: s.name, downstream_facilities: n, reach: dependents, sole_dependency_count: n, network_reach: reach, alternative_supply: n >= 3 ? "Limited" : n >= 1 ? "Partial" : "Available" };
  });
  out.sort((a, b) => b.downstream_facilities - a.downstream_facilities);
  return out;
}

export function regionalExposure(risks: Record<string, FacilityRisk>, med = "m_amox"): Regional {
  const rel = Object.values(risks).filter((r) => r.medicine_id === med);
  const n = Math.max(rel.length, 1);
  const high = rel.filter((r) => r.state === "high").length;
  const vuln = rel.filter((r) => r.state === "vulnerable").length;
  const score = ((high + 0.5 * vuln) / n) * 100;
  const label = score < 15 ? "Low" : score < 35 ? "Moderate" : score < 60 ? "High" : "Critical";
  return { high, vulnerable: vuln, total: rel.length, score: Math.round(score * 10) / 10, label };
}

export function buildTimeline(before: Record<string, FacilityRisk>, after: Record<string, FacilityRisk>, delay: number): TimelineStep[] {
  const tl: TimelineStep[] = [{ day: 0, event: `Supplier disruption: +${delay}-day delay detected` }];
  let worst = 0;
  for (const [k, a] of Object.entries(after)) {
    const b = before[k];
    if (!b || a.medicine_id !== "m_amox" || a.state === b.state) continue;
    worst = Math.max(worst, a.gap_days);
    const d1 = Math.max(1, Math.round(a.gap_days / 2));
    tl.push({ day: d1, event: `Inventory pressure begins at ${a.facility_id} (coverage ${a.coverage_days.toFixed(1)}d)` });
    tl.push({ day: Math.max(d1 + 1, Math.round(a.gap_days)), event: `${a.facility_id} enters ${a.state.toUpperCase()} state (gap ${a.gap_days >= 0 ? "+" : ""}${a.gap_days.toFixed(1)}d)` });
  }
  tl.push({ day: Math.round(Math.max(worst, delay)), event: "Regional exposure reassessed" });
  tl.sort((x, y) => x.day - y.day);
  return tl.slice(0, 8);
}

export function buildAlerts(after: Record<string, FacilityRisk>, before: Record<string, FacilityRisk>, sup: string | null, delay: number): AlertItem[] {
  const alerts: AlertItem[] = [];
  if (sup && delay) alerts.push({ level: "disruption", title: "SUPPLIER DISRUPTION", detail: `${sup}: +${delay}-day replenishment delay detected.`, why: "Upstream lead time increased; downstream ETAs extended by the same delay." });
  for (const a of Object.values(after)) {
    if (a.medicine_id !== "m_amox") continue;
    const b = before[`${a.facility_id}|${a.medicine_id}`];
    if (a.state === "high") alerts.push({ level: "high", title: "HIGH RISK", detail: `${a.facility_id}: stock coverage below replenishment window.`, why: a.why });
    else if (b && a.state !== b.state && a.state === "vulnerable") alerts.push({ level: "cascade", title: "CASCADE ALERT", detail: `${a.facility_id}: risk increased due to upstream supplier disruption.`, why: a.why });
    if (a.gap_days < -2 && a.state === "stable") alerts.push({ level: "surplus", title: "SURPLUS OPPORTUNITY", detail: `${a.facility_id}: ${Math.abs(a.gap_days).toFixed(0)} days of excess coverage detected.`, why: "Coverage exceeds replenishment + safety buffer. Potential redistribution candidate." });
  }
  return alerts;
}

export function facilityName(id: string): string {
  return FACILITIES.find((f) => f.id === id)?.name ?? id;
}
