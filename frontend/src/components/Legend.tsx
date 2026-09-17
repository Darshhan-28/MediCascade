// P1 — graph legend: risk states + edge semantics.
const ITEMS = [
  { sw: "#34d399", label: "Stable" },
  { sw: "#fbbf24", label: "Vulnerable" },
  { sw: "#f87171", label: "High Risk" },
  { sw: "#a78bfa", label: "Disrupted ⚠️" },
  { sw: "dashed", label: "Redistribution ⇄" },
];
export default function Legend() {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-300">
      {ITEMS.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.sw === "dashed"
            ? <span className="inline-block h-0 w-6 border-t-2 border-dashed border-slate-400" />
            : <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: i.sw }} />}
          {i.label}
        </span>
      ))}
      <span className="text-slate-500">Animated edges = cascade-affected</span>
    </div>
  );
}
