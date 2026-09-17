import type { Facility, Inventory, Medicine, Network, Supplier } from "../types";

// Embedded synthetic demo data (mirrors /data/*.json so the demo works with no backend).
export const FACILITIES: Facility[] = [
  { id: "hA", name: "Hospital A", type: "hospital", lat: 12.98, lon: 77.6, region: "Central", safety_stock_days: 5, replenishment_days: 10, supplier_id: "s_alpha", redistribution_capacity: 500, notes: "Single-source dependency on Supplier Alpha." },
  { id: "hB", name: "Hospital B", type: "hospital", lat: 13.05, lon: 77.68, region: "North", safety_stock_days: 5, replenishment_days: 10, supplier_id: "s_alpha", redistribution_capacity: 2000, notes: "Surplus candidate for redistribution." },
  { id: "hC", name: "Hospital C", type: "hospital", lat: 12.9, lon: 77.55, region: "South", safety_stock_days: 5, replenishment_days: 9, supplier_id: "s_alpha", redistribution_capacity: 400, notes: "Vulnerable at baseline." },
  { id: "hD", name: "Hospital D", type: "hospital", lat: 13.0, lon: 77.5, region: "West", safety_stock_days: 4, replenishment_days: 9, supplier_id: "s_beta", redistribution_capacity: 800, notes: "On Supplier Beta — insulated from Alpha disruption." },
  { id: "rmc", name: "Regional Medical Center", type: "medical_center", lat: 13.02, lon: 77.62, region: "Central", safety_stock_days: 6, replenishment_days: 8, supplier_id: "s_beta", redistribution_capacity: 1500 },
  { id: "dh", name: "District Hospital", type: "hospital", lat: 12.94, lon: 77.66, region: "East", safety_stock_days: 5, replenishment_days: 9, supplier_id: "s_alpha", redistribution_capacity: 600 },
  { id: "ch", name: "Community Hospital", type: "hospital", lat: 12.96, lon: 77.58, region: "Central", safety_stock_days: 4, replenishment_days: 8, supplier_id: "s_gamma", redistribution_capacity: 500 },
];

export const MEDICINES: Medicine[] = [
  { id: "m_amox", name: "Amoxicillin 500mg", category: "Antibiotic", unit: "capsules" },
  { id: "m_cef", name: "Ceftriaxone 1g", category: "Antibiotic", unit: "vials" },
  { id: "m_ins", name: "Insulin Glargine", category: "Chronic care", unit: "pens" },
  { id: "m_para", name: "Paracetamol 500mg", category: "Analgesic", unit: "tablets" },
  { id: "m_azi", name: "Azithromycin 500mg", category: "Antibiotic", unit: "tablets" },
];

export const SUPPLIERS: Supplier[] = [
  { id: "s_alpha", name: "Supplier Alpha", location: "North Depot", reliability_score: 0.82, lead_time_days: 6, status: "operational" },
  { id: "s_beta", name: "Supplier Beta", location: "East Depot", reliability_score: 0.94, lead_time_days: 4, status: "operational" },
  { id: "s_gamma", name: "Supplier Gamma", location: "South Depot", reliability_score: 0.78, lead_time_days: 7, status: "operational" },
];

export const INVENTORY: Inventory[] = [
  { facility_id: "hA", medicine_id: "m_amox", current_stock: 4800, daily_consumption: 600, safety_stock_days: 5, replenishment_eta_days: 10, supplier_id: "s_alpha" },
  { facility_id: "hB", medicine_id: "m_amox", current_stock: 12000, daily_consumption: 700, safety_stock_days: 5, replenishment_eta_days: 10, supplier_id: "s_alpha" },
  { facility_id: "hC", medicine_id: "m_amox", current_stock: 3000, daily_consumption: 600, safety_stock_days: 5, replenishment_eta_days: 9, supplier_id: "s_alpha" },
  { facility_id: "hD", medicine_id: "m_amox", current_stock: 7000, daily_consumption: 700, safety_stock_days: 4, replenishment_eta_days: 9, supplier_id: "s_beta" },
  { facility_id: "rmc", medicine_id: "m_amox", current_stock: 10000, daily_consumption: 900, safety_stock_days: 6, replenishment_eta_days: 8, supplier_id: "s_beta" },
  { facility_id: "dh", medicine_id: "m_amox", current_stock: 3600, daily_consumption: 600, safety_stock_days: 5, replenishment_eta_days: 9, supplier_id: "s_alpha" },
  { facility_id: "ch", medicine_id: "m_amox", current_stock: 5500, daily_consumption: 650, safety_stock_days: 4, replenishment_eta_days: 8, supplier_id: "s_gamma" },
  { facility_id: "hA", medicine_id: "m_cef", current_stock: 2200, daily_consumption: 220, safety_stock_days: 5, replenishment_eta_days: 9, supplier_id: "s_alpha" },
  { facility_id: "hC", medicine_id: "m_ins", current_stock: 900, daily_consumption: 120, safety_stock_days: 6, replenishment_eta_days: 10, supplier_id: "s_alpha" },
  { facility_id: "hB", medicine_id: "m_para", current_stock: 20000, daily_consumption: 1500, safety_stock_days: 4, replenishment_eta_days: 7, supplier_id: "s_beta" },
];

export const NETWORK: Network = {
  nodes: [
    { id: "s_alpha", kind: "supplier" }, { id: "s_beta", kind: "supplier" }, { id: "s_gamma", kind: "supplier" },
    { id: "w_cdc", kind: "warehouse", name: "Central Distribution Center" },
    { id: "hA", kind: "hospital" }, { id: "hB", kind: "hospital" }, { id: "hC", kind: "hospital" },
    { id: "hD", kind: "hospital" }, { id: "rmc", kind: "hospital" }, { id: "dh", kind: "hospital" }, { id: "ch", kind: "hospital" },
  ],
  edges: [
    { from: "s_alpha", to: "w_cdc", relationship: "supply", lead_time_days: 6, capacity_units: 50000, distance_km: 120 },
    { from: "s_beta", to: "w_cdc", relationship: "supply", lead_time_days: 4, capacity_units: 40000, distance_km: 80 },
    { from: "s_gamma", to: "w_cdc", relationship: "supply", lead_time_days: 7, capacity_units: 25000, distance_km: 150 },
    { from: "w_cdc", to: "hA", relationship: "supply", lead_time_days: 2, capacity_units: 10000, distance_km: 18 },
    { from: "w_cdc", to: "hB", relationship: "supply", lead_time_days: 2, capacity_units: 12000, distance_km: 22 },
    { from: "w_cdc", to: "hC", relationship: "supply", lead_time_days: 2, capacity_units: 8000, distance_km: 15 },
    { from: "w_cdc", to: "hD", relationship: "supply", lead_time_days: 3, capacity_units: 9000, distance_km: 30 },
    { from: "w_cdc", to: "rmc", relationship: "supply", lead_time_days: 1, capacity_units: 15000, distance_km: 8 },
    { from: "w_cdc", to: "dh", relationship: "supply", lead_time_days: 2, capacity_units: 7000, distance_km: 25 },
    { from: "w_cdc", to: "ch", relationship: "supply", lead_time_days: 2, capacity_units: 6000, distance_km: 12 },
    { from: "hB", to: "hA", relationship: "redistribution", lead_time_days: 1, capacity_units: 2000, distance_km: 14 },
    { from: "hB", to: "hC", relationship: "redistribution", lead_time_days: 1, capacity_units: 1500, distance_km: 20 },
    { from: "hD", to: "hC", relationship: "redistribution", lead_time_days: 1, capacity_units: 1000, distance_km: 18 },
    { from: "rmc", to: "hA", relationship: "redistribution", lead_time_days: 1, capacity_units: 1500, distance_km: 10 },
  ],
};

export const NODE_LABEL: Record<string, string> = {
  s_alpha: "Supplier Alpha", s_beta: "Supplier Beta", s_gamma: "Supplier Gamma",
  w_cdc: "Central Distribution Center", hA: "Hospital A", hB: "Hospital B",
  hC: "Hospital C", hD: "Hospital D", rmc: "Regional Medical Center",
  dh: "District Hospital", ch: "Community Hospital",
};
