export type RiskState = "stable" | "vulnerable" | "high";

export interface Facility { id: string; name: string; type: string; lat: number; lon: number; region: string; safety_stock_days: number; replenishment_days: number; supplier_id: string; redistribution_capacity: number; notes?: string; }
export interface Medicine { id: string; name: string; category: string; unit: string; }
export interface Supplier { id: string; name: string; location: string; reliability_score: number; lead_time_days: number; status: string; }
export interface Inventory { facility_id: string; medicine_id: string; current_stock: number; daily_consumption: number; safety_stock_days: number; replenishment_eta_days: number; supplier_id: string; }
export interface NetEdge { from: string; to: string; relationship: string; lead_time_days: number; capacity_units: number; distance_km: number; }
export interface Network { nodes: { id: string; kind: string; name?: string }[]; edges: NetEdge[]; }

export interface Resilience { state: "HIGH" | "MEDIUM" | "LOW"; factors: string[]; }
export interface FacilityRisk { facility_id: string; medicine_id: string; stock: number; daily_consumption: number; eta_days: number; supplier_id: string; disrupted: boolean; score: number; state: RiskState; coverage_days: number; gap_days: number; factors: { cover: number; gap: number; supplier: number; network: number }; why: string; alt_routes: number; safety_stock_days: number; resilience: Resilience; }
export interface CriticalNode { node_id: string; name: string; downstream_facilities: number; reach: string[]; sole_dependency_count: number; alternative_supply: string; network_reach: number; }
export interface Regional { high: number; vulnerable: number; total: number; score: number; label: string; }
export interface TimelineStep { day: number; event: string; }
export interface AlertItem { level: string; title: string; detail: string; why: string; }
export interface SimulateResult { before: FacilityRisk[]; after: FacilityRisk[]; regional_before: Regional; regional_after: Regional; timeline: TimelineStep[]; affected_nodes: string[]; surplus: { facility_id: string; excess_days: number; stock: number }[]; alerts: AlertItem[]; critical: CriticalNode[]; engine: "api" | "local"; }
