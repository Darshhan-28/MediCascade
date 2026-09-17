import { useEffect, useState } from "react";
import { HISTORY } from "../data/history";
import { INVENTORY } from "../data/synthetic";

export interface ForecastResult {
  facility_id: string; medicine_id: string;
  current_consumption: number; current_stock: number; current_coverage_days: number;
  predicted_daily: number; horizon_days: number; daily_forecast: number[];
  forecast_coverage_days: number; mae: number; naive_mae: number; model: string;
  n_train: number; n_test: number; data_source: string; error?: string;
}

const API = "http://localhost:8000";

export async function fetchForecast(facility_id: string, medicine_id = "m_amox"): Promise<ForecastResult | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${API}/api/forecast?facility_id=${facility_id}&medicine_id=${medicine_id}&horizon=7`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = (await res.json()) as ForecastResult;
    return j.error ? null : j;
  } catch { return null; }
}

// Offline fallback from the mirrored synthetic history: 14-day moving average.
// Labeled as a trend estimate — never presented as the ML model.
export function offlineEstimate(facility_id: string, medicine_id = "m_amox"): { predicted: number; coverage: number } | null {
  const series = HISTORY[`${facility_id}|${medicine_id}`];
  const inv = INVENTORY.find((i) => i.facility_id === facility_id && i.medicine_id === medicine_id);
  if (!series || !inv) return null;
  const avg14 = series.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, series.length);
  return { predicted: Math.round(avg14 * 10) / 10, coverage: Math.round((inv.current_stock / Math.max(avg14, 1e-6)) * 100) / 100 };
}

const FAC_IDS = [...new Set(INVENTORY.filter((i) => i.medicine_id === "m_amox").map((i) => i.facility_id))];

// Compact ML demand-forecast panel. ML predicts demand; deterministic engines
// evaluate risk — the panel never shows a risk score of its own.
export default function ForecastPanel() {
  const [fac, setFac] = useState("hA");
  const [data, setData] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchForecast(fac).then((r) => { if (live) { setData(r); setLoading(false); } });
    return () => { live = false; };
  }, [fac]);

  const off = !loading && !data ? offlineEstimate(fac) : null;

  return (
    <div className="text-sm">
      <label className="flex items-center gap-2">Facility
        <select value={fac} onChange={(e) => setFac(e.target.value)} className="rounded bg-slate-900 p-1.5">
          {FAC_IDS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        {loading && <span className="text-xs text-slate-500">loading forecast…</span>}
      </label>

      {data && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded bg-slate-900 p-2"><p className="text-xs text-slate-500">Current demand</p><p className="text-lg font-bold">{data.current_consumption}/day</p></div>
            <div className="rounded bg-slate-900 p-2"><p className="text-xs text-slate-500">Predicted demand (7d)</p><p className="text-lg font-bold text-violet-300">{data.predicted_daily}/day</p></div>
            <div className="rounded bg-slate-900 p-2"><p className="text-xs text-slate-500">Coverage now</p><p className="text-lg font-bold">{data.current_coverage_days}d</p></div>
            <div className="rounded bg-slate-900 p-2"><p className="text-xs text-slate-500">Forecast coverage</p><p className="text-lg font-bold text-violet-300">{data.forecast_coverage_days}d</p></div>
          </div>
          <p className="text-xs text-slate-400">Model: {data.model} · Validation MAE <b className="text-slate-200">{data.mae}</b> units/day vs naive baseline {data.naive_mae} (holdout: last 7 days × 10 series, n_test={data.n_test})</p>
          <p className="text-xs text-slate-500">Data: {data.data_source}</p>
          <p className="rounded bg-slate-900 p-2 text-xs text-slate-300"><b>Why ML here?</b> Historical consumption contains patterns that improve demand estimation — while explicit supply-network logic stays in charge of explaining propagation and intervention consequences. ML predicts demand; deterministic engines evaluate shortage risk.</p>
        </div>
      )}

      {off && (
        <div className="mt-2 space-y-2">
          <p className="rounded border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-200">ML backend unreachable — offline 14-day trend estimate (not an ML prediction). Core risk/cascade demo unaffected.</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded bg-slate-900 p-2"><p className="text-xs text-slate-500">Trend-estimated demand</p><p className="text-lg font-bold">{off.predicted}/day</p></div>
            <div className="rounded bg-slate-900 p-2"><p className="text-xs text-slate-500">Implied coverage</p><p className="text-lg font-bold">{off.coverage}d</p></div>
          </div>
        </div>
      )}
    </div>
  );
}
