import type { FacilityRisk } from "../types";
import { SUPPLIERS } from "../data/synthetic";

const stateColor = (s: string) => s === "high" ? "#f87171" : s === "vulnerable" ? "#fbbf24" : "#34d399";
const stateLabel = (s: string) => s === "high" ? "HIGH" : s === "vulnerable" ? "VULNERABLE" : "STABLE";
const resColor = (s: string) => s === "HIGH" ? "#34d399" : s === "MEDIUM" ? "#fbbf24" : "#f87171";

function FactorBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-36 shrink-0 text-slate-400">{label}</span>
      <div className="h-2 flex-1 rounded bg-slate-900">
        <div className="h-2 rounded" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: value <= 0 ? "#34d399" : value >= 20 ? "#f87171" : "#fbbf24" }} />
      </div>
      <span className="w-10 shrink-0 text-right font-bold text-slate-200">+{value}</span>
    </div>
  );
}

// P2/P9 — risk score, numeric factor contributions, WHAT CHANGED before→after,
// network resilience, evidence table, templated Why? (never generic AI text).
export default function FacilityEvidence({ risk, before }: { risk: FacilityRisk; before?: FacilityRisk }) {
  const supName = SUPPLIERS.find((s) => s.id === risk.supplier_id)?.name ?? risk.supplier_id;
  const changed = (label: string, b: string, a: string, bad?: boolean) => (
    <div className="flex justify-between gap-2 rounded bg-slate-900 px-2 py-1">
      <span className="text-slate-400">{label}</span>
      <span><span className="text-slate-400">{b}</span> <span className="text-slate-500">→</span> <b style={{ color: bad ? "#f87171" : "#e2e8f0" }}>{a}</b></span>
    </div>
  );
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <p className="text-4xl font-bold" style={{ color: stateColor(risk.state) }}>{risk.score}</p>
        <div>
          <p className="font-bold" style={{ color: stateColor(risk.state) }}>{stateLabel(risk.state)}</p>
          <p className="text-xs text-slate-400">RISK SCORE · Amoxicillin 500mg</p>
        </div>
        <span className="ml-auto rounded px-2 py-0.5 text-xs font-bold" style={{ background: resColor(risk.resilience.state) + "22", color: resColor(risk.resilience.state), border: `1px solid ${resColor(risk.resilience.state)}` }}>
          Resilience {risk.resilience.state}
        </span>
      </div>

      <div className="space-y-1.5">
        <FactorBar label="Stock Coverage" value={risk.factors.cover} max={35} />
        <FactorBar label="Replenishment Gap" value={risk.factors.gap} max={30} />
        <FactorBar label="Supplier Dependency" value={risk.factors.supplier} max={30} />
        <FactorBar label="Network Exposure" value={risk.factors.network} max={13} />
      </div>

      {before && (
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">What changed?</p>
          <div className="space-y-1 text-xs">
            {changed("ETA", `${before.eta_days}d`, `${risk.eta_days}d`, risk.eta_days > before.eta_days)}
            {changed("Gap", `${before.gap_days > 0 ? "+" : ""}${before.gap_days}d`, `${risk.gap_days > 0 ? "+" : ""}${risk.gap_days}d`, risk.gap_days > before.gap_days)}
            {changed("Supplier", before.disrupted ? "Disrupted" : "Normal", risk.disrupted ? "Disrupted" : "Normal", risk.disrupted && !before.disrupted)}
            {changed("Risk", `${before.score} ${stateLabel(before.state)}`, `${risk.score} ${stateLabel(risk.state)}`, risk.score > before.score)}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Evidence</p>
        <div className="grid grid-cols-2 gap-1 text-xs">
          {[["Coverage", `${risk.coverage_days}d`], ["Safety threshold", `${risk.safety_stock_days}d`],
            ["Replenishment ETA", `${risk.eta_days}d`], ["Supplier", supName],
            ["Supplier status", risk.disrupted ? "⚠️ Disrupted" : "Normal"],
            ["Alternative routes", `${risk.alt_routes}`],
            ["Resilience", risk.resilience.state],
            ["Stock", `${risk.stock.toLocaleString()} u`]].map(([k, v]) => (
            <div key={k} className="rounded bg-slate-900 px-2 py-1"><span className="text-slate-500">{k}: </span><b>{v}</b></div>
          ))}
        </div>
      </div>

      <div className="text-xs text-slate-400">Network resilience: {risk.resilience.factors.join(" · ")}</div>
      <div className="rounded-lg bg-slate-900 p-2 text-xs text-slate-300"><b>Why?</b> {risk.why}</div>
    </div>
  );
}
