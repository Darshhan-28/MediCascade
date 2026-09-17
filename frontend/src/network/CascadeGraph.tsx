import { useMemo } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import { NETWORK, NODE_LABEL } from "../data/synthetic";
import type { FacilityRisk } from "../types";

const POS: Record<string, { x: number; y: number }> = {
  s_alpha: { x: 0, y: 80 }, s_beta: { x: 0, y: 230 }, s_gamma: { x: 0, y: 380 },
  w_cdc: { x: 300, y: 230 },
  hA: { x: 600, y: 0 }, hB: { x: 600, y: 130 }, hC: { x: 600, y: 260 }, hD: { x: 600, y: 390 },
  rmc: { x: 880, y: 60 }, dh: { x: 880, y: 220 }, ch: { x: 880, y: 360 },
};

function neighbors(id: string): Set<string> {
  const s = new Set<string>([id]);
  for (const e of NETWORK.edges) {
    if (e.from === id) s.add(e.to);
    if (e.to === id) s.add(e.from);
  }
  return s;
}

export default function CascadeGraph({ risks, affected, selected, onSelect, pulse, reveal }: {
  risks: FacilityRisk[]; affected: string[]; selected: string | null; onSelect: (id: string | null) => void; pulse: boolean; reveal?: string[] | null;
}) {
  const vis = reveal ?? affected; // staged demo reveal subset; defaults to full affected set
  const byFac = useMemo(() => Object.fromEntries(risks.filter((r) => r.medicine_id === "m_amox").map((r) => [r.facility_id, r])), [risks]);
  const nb = useMemo(() => (selected ? neighbors(selected) : null), [selected]);

  const nodes: Node[] = useMemo(() => NETWORK.nodes.map((n) => {
    const isHosp = n.kind === "hospital";
    const r = byFac[n.id];
    const cls = !isHosp ? (n.kind === "supplier" ? "flow-supplier" : "flow-warehouse")
      : r?.state === "high" ? "flow-high" : r?.state === "vulnerable" ? "flow-vulnerable" : "flow-stable";
    const dim = nb && !nb.has(n.id) ? " flow-dim" : "";
    const sel = selected === n.id ? " flow-selected" : "";
    const dot = isHosp ? (r?.state === "high" ? "🔴" : r?.state === "vulnerable" ? "🟡" : "🟢") : n.kind === "supplier" ? (affected.includes(n.id) || (r as unknown) ? "" : "") : "🏭";
    const warn = vis.includes(n.id) ? " ⚠️" : "";
    return {
      id: n.id, position: POS[n.id] ?? { x: 0, y: 0 },
      data: { label: `${n.kind === "supplier" ? "🟣 " : n.kind === "warehouse" ? "🏭 " : dot + " "}${NODE_LABEL[n.id] ?? n.id}${warn}${isHosp && r ? ` · ${r.score}` : ""}` },
      className: cls + dim + sel, style: { width: n.kind === "hospital" ? 210 : 200 },
    };
  }), [byFac, vis, nb, selected]);

  const edges: Edge[] = useMemo(() => NETWORK.edges.map((e, i) => {
    const hot = vis.includes(e.from) || vis.includes(e.to) || (vis.includes("w_cdc") && e.from === "w_cdc");
    const isAff = e.from === "s_alpha" && pulse ? true : hot && pulse;
    return {
      id: `e${i}`, source: e.from, target: e.to, animated: !!isAff,
      label: e.relationship === "redistribution" ? "⇄" : undefined,
      className: isAff ? "edge-pulse" : hot ? "edge-affected" : "edge-calm",
      style: e.relationship === "redistribution" ? { strokeDasharray: "6 4" } : undefined,
    };
  }), [vis, pulse]);

  return (
    <div className="h-[460px] rounded-xl border border-slate-700 bg-slate-900/60">
      <ReactFlow nodes={nodes} edges={edges} onNodeClick={(_, n) => onSelect(selected === n.id ? null : n.id)}
        onPaneClick={() => onSelect(null)} fitView fitViewOptions={{ padding: 0.15 }}>
        <Background color="#1e293b" gap={24} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
