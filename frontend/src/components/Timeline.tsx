import type { TimelineStep } from "../types";

// P3 — staged cascade timeline. `shown` caps visible steps for demo animation.
export default function Timeline({ steps, shown }: { steps: TimelineStep[]; shown?: number }) {
  const vis = shown == null ? steps : steps.slice(0, shown);
  return (
    <ol className="relative space-y-3 border-l-2 border-slate-700 pl-4 text-sm">
      {vis.map((t, i) => (
        <li key={i} className="relative">
          <span className={`absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-violet-400" : t.event.includes("HIGH") ? "bg-red-400" : t.event.includes("VULNERABLE") ? "bg-amber-400" : "bg-slate-400"}`} />
          <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-bold">T+{t.day}</span>
          <p className="mt-0.5 text-slate-300">{t.event}</p>
        </li>
      ))}
      {shown != null && shown < steps.length && <li className="animate-pulse text-xs text-slate-500">propagating…</li>}
    </ol>
  );
}
