import type { Regional } from "../types";

// P4 — CASCADE EXPOSURE: weighted % of regional facilities by risk state, before → after.
export default function ExposureCard({ before, after }: { before: Regional; after: Regional }) {
  const delta = Math.round((after.score - before.score) * 10) / 10;
  const up = delta > 0;
  return (
    <div>
      <div className="flex items-end gap-3">
        <div>
          <p className="text-xs text-slate-400">Before</p>
          <p className="text-2xl font-bold text-emerald-300">{before.score}%</p>
        </div>
        <span className="pb-1 text-slate-500">→</span>
        <div>
          <p className="text-xs text-slate-400">After</p>
          <p className="text-2xl font-bold text-red-300">{after.score}%</p>
        </div>
        <span className={`mb-1 rounded px-2 py-0.5 text-xs font-bold ${up ? "bg-red-900 text-red-200" : "bg-emerald-900 text-emerald-200"}`}>
          {up ? "+" : ""}{delta} pp
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold text-white">{after.label} <span className="font-normal text-slate-400">· {after.high} high-risk, {after.vulnerable} vulnerable of {after.total}</span></p>
      <p className="mt-1 text-[11px] text-slate-500">Percentage of regional facilities weighted by current risk state. <span className="rounded border border-slate-600 px-1">Synthetic simulation</span></p>
    </div>
  );
}
