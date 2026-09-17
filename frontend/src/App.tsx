import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Beaker, Bell, Boxes, Map, Play, RotateCcw, ShieldCheck, Syringe, FlaskConical, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import CascadeGraph from "./network/CascadeGraph";
import ExposureCard from "./components/ExposureCard";
import Legend from "./components/Legend";
import FacilityEvidence from "./components/FacilityEvidence";
import Timeline from "./components/Timeline";
import { baseline, intervene, pingBackend, simulate } from "./services/api";
import { FACILITIES, MEDICINES, NODE_LABEL, SUPPLIERS } from "./data/synthetic";
import type { FacilityRisk, SimulateResult } from "./types";

const TABS = [
  { id: "overview", label: "Overview", icon: ShieldCheck },
  { id: "network", label: "Network", icon: Map },
  { id: "shortages", label: "Shortages", icon: Syringe },
  { id: "simulator", label: "Simulator", icon: Beaker },
  { id: "interventions", label: "Interventions", icon: ArrowRightLeft },
  { id: "alerts", label: "Alerts", icon: Bell },
] as const;
type Tab = (typeof TABS)[number]["id"];

const stateColor = (s: string) => s === "high" ? "#f87171" : s === "vulnerable" ? "#fbbf24" : "#34d399";
const stateLabel = (s: string) => s === "high" ? "High Risk" : s === "vulnerable" ? "Vulnerable" : "Stable";

function Card({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-xl border border-slate-700 bg-slate-800/60 p-4 ${wide ? "md:col-span-2" : ""}`}>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

function RiskBadge({ state }: { state: string }) {
  return <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: stateColor(state) + "22", color: stateColor(state), border: `1px solid ${stateColor(state)}` }}>{stateLabel(state)}</span>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [supplier, setSupplier] = useState("s_alpha");
  const [delay, setDelay] = useState(7);
  const [demand, setDemand] = useState(0);
  const [sim, setSim] = useState<SimulateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [backend, setBackend] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<string | null>("hA");
  const [demoRunning, setDemoRunning] = useState(false);
  const [redist, setRedist] = useState<{ moved?: number; after: FacilityRisk[]; regional: SimulateResult["regional_after"]; tradeoff: Record<string, number> } | null>(null);
  const [altSup, setAltSup] = useState<{ after: FacilityRisk[]; regional: SimulateResult["regional_after"]; tradeoff: Record<string, number> } | null>(null);
  const [whyOpen, setWhyOpen] = useState<string | null>(null);
  const [reveal, setReveal] = useState<string[] | null>(null); // staged cascade reveal (demo)
  const [tlShown, setTlShown] = useState<number | null>(null); // staged timeline steps (demo)
  const [demoCaption, setDemoCaption] = useState<string | null>(null);
  const [forecastSurge, setForecastSurge] = useState(20);
  const demoToken = useRef(0);

  useEffect(() => {
    baseline().then((r) => { setSim(r); setBackend(r.engine === "api"); });
    pingBackend().then(setBackend);
  }, []);

  const risks: FacilityRisk[] = useMemo(() => sim?.after ?? [], [sim]);
  const amox = useMemo(() => risks.filter((r) => r.medicine_id === "m_amox"), [risks]);
  const byId = useMemo(() => Object.fromEntries(amox.map((r) => [r.facility_id, r])), [amox]);
  const engine = sim?.engine ?? (backend ? "api" : "local");

  async function runSim() {
    setLoading(true);
    const r = await simulate(supplier, delay, "m_amox", demand);
    setSim(r); setBackend(r.engine === "api"); setRedist(null); setAltSup(null);
    setReveal(null); setTlShown(null); setDemoCaption(null);
    setLoading(false);
  }
  async function reset() {
    demoToken.current += 1;
    setSupplier("s_alpha"); setDelay(0); setDemand(0); setSelected("hA"); setRedist(null); setAltSup(null);
    setReveal(null); setTlShown(null); setDemoCaption(null); setDemoRunning(false);
    setLoading(true);
    const r = await baseline();
    setSim(r); setBackend(r.engine === "api");
    setLoading(false);
  }
  const sleep = (ms: number, tok: number) => new Promise<boolean>((res) => {
    const id = setTimeout(() => res(demoToken.current === tok), ms);
    void id;
  });
  // P11 — staged demo, ends FROZEN on the intervention trade-off. Manual RESET only.
  async function runDemo() {
    const tok = demoToken.current + 1;
    demoToken.current = tok;
    const alive = () => demoToken.current === tok;
    setDemoRunning(true);
    setRedist(null); setAltSup(null);
    // 1-4. baseline network + exposure, select Hospital A with evidence
    setTab("overview"); setSupplier("s_alpha"); setDelay(0); setDemand(0);
    setSim(await simulate("s_alpha", 0, "m_amox", 0));
    if (!alive()) return;
    setReveal(null); setTlShown(null);
    setDemoCaption("Baseline: Hospital A is stable · Regional exposure Low");
    setSelected("hA");
    if (!(await sleep(2200, tok))) return;
    // evidence beat on network tab
    setTab("network");
    setDemoCaption("Hospital A evidence: 8.0d coverage vs 10d replenishment — thin buffer, Alpha-dependent");
    if (!(await sleep(2400, tok))) return;
    // 5-7. trigger disruption on simulator tab
    setTab("simulator");
    setDemoCaption("Trigger: Supplier Alpha disrupted · delay +7 days");
    setDelay(7);
    if (!(await sleep(1400, tok))) return;
    const r = await simulate("s_alpha", 7, "m_amox", 0);
    if (!alive()) return;
    setSim(r); setBackend(r.engine === "api");
    // 8. staged cascade reveal: supplier → CDC → A → others, timeline stepping
    const escalated = [...r.after].filter((x) => x.medicine_id === "m_amox" && x.disrupted && (x.state === "high" || x.state === "vulnerable"))
      .sort((a, b) => b.gap_days - a.gap_days).map((x) => x.facility_id);
    const stages: { nodes: string[]; cap: string; tl: number }[] = [
      { nodes: ["s_alpha"], cap: "T+0 — Supplier Alpha disrupted: replenishment delayed", tl: 1 },
      { nodes: ["s_alpha", "w_cdc"], cap: "Delay propagates through the Central Distribution Center", tl: 1 },
      { nodes: ["s_alpha", "w_cdc", "hA"], cap: "Hospital A absorbs the shock: coverage 8.0d vs 17d ETA → HIGH RISK", tl: 3 },
      { nodes: ["s_alpha", "w_cdc", ...escalated], cap: "Cascade widens: Hospital C and District Hospital escalate", tl: 5 },
      { nodes: r.affected_nodes, cap: `Regional exposure ${r.regional_before.label} → ${r.regional_after.label} (+${(Math.round((r.regional_after.score - r.regional_before.score) * 10) / 10)} pp)`, tl: 99 },
    ];
    for (const s of stages) {
      if (!alive()) return;
      setReveal(s.nodes); setTlShown(s.tl); setDemoCaption(s.cap); setSelected("hA");
      if (!(await sleep(1700, tok))) return;
    }
    // 12. surplus spotlight
    if (!alive()) return;
    setSelected("hB");
    setDemoCaption(`Surplus opportunity: Hospital B holds ${r.surplus.find((s) => s.facility_id === "hB")?.excess_days ?? "–"}d excess coverage — redistribution candidate`);
    if (!(await sleep(2200, tok))) return;
    // 13-17. intervention finale — FROZEN, no auto-reset
    if (!alive()) return;
    setTab("interventions"); setReveal(null); setTlShown(null);
    setDemoCaption("Intervention comparison: what relieves Hospital A — and at what network cost?");
    await runInterventions(7, 0);
    if (!alive()) return;
    setDemoCaption("Simulated trade-off: redistribution relieves A but spends B's buffer · Human decision required");
    setDemoRunning(false);
  }
  function skipDemo() { demoToken.current += 1; setDemoRunning(false); setDemoCaption(null); setReveal(null); setTlShown(null); }
  async function runInterventions(d = delay, dm = demand) {
    const [a, b] = await Promise.all([intervene("redistribute", { delay: d, demand: dm, units: 1500 }), intervene("alt_supplier", { delay: d, demand: dm })]);
    setRedist(a); setAltSup(b);
  }

  const selRisk = selected ? amox.find((r) => r.facility_id === selected) : undefined;

  const chartData = [...amox].sort((a, b) => b.score - a.score).map((r) => ({ name: r.facility_id, score: r.score, state: r.state }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <FlaskConical className="text-violet-400" size={22} />
          <div>
            <h1 className="text-lg font-bold text-white">MediCascade</h1>
            <p className="text-xs text-slate-400">Regional Medicine Shortage Cascade Intelligence · Synthetic demo data</p>
          </div>
          <span className={`ml-2 rounded px-2 py-0.5 text-xs font-bold ${engine === "api" ? "bg-emerald-900 text-emerald-300" : "bg-amber-900 text-amber-300"}`}>
            {engine === "api" ? "● API" : "● LOCAL"}
          </span>
          <div className="ml-auto flex gap-2">
            <button onClick={runDemo} disabled={demoRunning} className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
              <Play size={14} /> {demoRunning ? "RUNNING…" : "▶ RUN DEMO"}
            </button>
            {demoRunning && (
              <button onClick={skipDemo} className="rounded-lg border border-amber-500 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-900">
                Skip
              </button>
            )}
            <button onClick={reset} className="flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800">
              <RotateCcw size={14} /> RESET
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${tab === t.id ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800"}`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        {demoCaption && (
          <div className="flex items-center gap-2 rounded-xl border border-violet-500/50 bg-violet-950/60 px-4 py-2.5 text-sm text-violet-100">
            <Play size={14} className="shrink-0 text-violet-300" />
            <b>DEMO:</b> {demoCaption}
          </div>
        )}
        {tab === "overview" && sim && (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card title="Cascade Exposure">
                <ExposureCard before={sim.regional_before} after={sim.regional_after} />
              </Card>
              <Card title="Facilities Monitored"><p className="text-3xl font-bold text-white">{FACILITIES.length}</p><p className="text-xs text-slate-400">7 hospitals + CDC + 3 suppliers</p></Card>
              <Card title="High / Vulnerable"><p className="text-3xl font-bold text-white">{sim.regional_after.high} / {sim.regional_after.vulnerable}</p><p className="text-xs text-slate-400">Amoxicillin 500mg · {engine} engine</p></Card>
              <Card title="Active Alerts"><p className="text-3xl font-bold text-white">{sim.alerts.length}</p><p className="text-xs text-slate-400">incl. surplus opportunities</p></Card>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Regional Network (click a node)">
                <CascadeGraph risks={risks} affected={sim.affected_nodes} selected={selected} onSelect={setSelected} pulse={sim.affected_nodes.length > 0} reveal={reveal} />
                <Legend />
              </Card>
              <div className="space-y-4">
                <Card title="Top At-Risk Facilities">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} layout="vertical">
                        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} stroke="#64748b" fontSize={11} />
                        <YAxis type="category" dataKey="name" stroke="#cbd5e1" fontSize={11} width={50} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                        <Bar dataKey="score">{chartData.map((d, i) => <Cell key={i} fill={stateColor(d.state)} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card title="Active Alerts">
                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {sim.alerts.map((a, i) => (
                      <div key={i} className="rounded-lg border border-slate-700 p-2 text-sm">
                        <span className="font-bold text-amber-300">{a.title}</span>
                        <p className="text-slate-300">{a.detail}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          </>
        )}

        {tab === "network" && sim && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <Card title="Supply Network — Supplier → CDC → Facilities ⇄ Redistribution">
                <CascadeGraph risks={risks} affected={sim.affected_nodes} selected={selected} onSelect={setSelected} pulse={sim.affected_nodes.length > 0} reveal={reveal} />
                <Legend />
              </Card>
              {sim.critical?.[0] && (
                <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-red-300">Critical network node</h3>
                  <p className="text-sm"><b className="text-white">{sim.critical[0].name}</b> — downstream facilities: <b>{sim.critical[0].downstream_facilities}</b> ({sim.critical[0].reach.join(", ")})</p>
                  <p className="mt-1 text-xs text-slate-400">Alternative supply: <b>{sim.critical[0].alternative_supply}</b> · Potential cascade reach: {sim.critical[0].downstream_facilities} facilities · Computed from the supply graph and sourcing data. Synthetic simulation.</p>
                </div>
              )}
            </div>
            <Card title={selected ? (NODE_LABEL[selected] ?? selected) : "Select a node"}>
              {!selected && <p className="text-sm text-slate-400">Click any node to inspect stock, coverage, supplier and risk factors.</p>}
              {selected && selRisk && (
                <FacilityEvidence risk={selRisk} before={sim.before.find((b) => b.facility_id === selRisk.facility_id && b.medicine_id === selRisk.medicine_id)} />
              )}
              {selected && !selRisk && <p className="text-sm text-slate-400">{NODE_LABEL[selected]} — {selected.startsWith("s_") ? "upstream supplier node" : "distribution hub"}. Disruptions here propagate downstream.</p>}
            </Card>
          </div>
        )}

        {tab === "shortages" && sim && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Medicine-Level Risk (Amoxicillin 500mg)" wide>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-400"><th>Facility</th><th>Coverage</th><th>ETA</th><th>Gap</th><th>Score</th><th>State</th></tr></thead>
                <tbody>
                  {amox.map((r) => (
                    <tr key={r.facility_id} className="border-t border-slate-700">
                      <td className="py-1">{r.facility_id}</td><td>{r.coverage_days}d</td><td>{r.eta_days}d</td>
                      <td style={{ color: r.gap_days > 0 ? "#f87171" : "#34d399" }}>{r.gap_days > 0 ? "+" : ""}{r.gap_days}d</td>
                      <td>{r.score}</td><td><RiskBadge state={r.state} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-400">Critical exposure = ETA − coverage. Positive gap means current inventory may not cover the expected replenishment window. Shortage is simulated, not guaranteed.</p>
            </Card>
            <Card title="Coverage vs Replenishment">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={amox.map((r) => ({ name: r.facility_id, Coverage: r.coverage_days, ETA: r.eta_days }))}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#cbd5e1" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                    <Bar dataKey="Coverage" fill="#34d399" /><Bar dataKey="ETA" fill="#f87171" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Other Medicines (baseline)">
              <div className="space-y-1 text-sm">
                {risks.filter((r) => r.medicine_id !== "m_amox").map((r) => (
                  <p key={r.facility_id + r.medicine_id}>{MEDICINES.find((m) => m.id === r.medicine_id)?.name} @ {r.facility_id}: {r.coverage_days}d coverage · <RiskBadge state={r.state} /></p>
                ))}
              </div>
            </Card>
            <Card title="Demand Forecast — Projected Coverage (explainable, no ML)" wide>
              <div className="mb-2 flex items-center gap-2 text-sm">
                <TrendingUp size={14} className="text-violet-300" />
                <label>Demand trend: <b>+{forecastSurge}%</b>
                  <input type="range" min={0} max={50} step={5} value={forecastSurge} onChange={(e) => setForecastSurge(Number(e.target.value))} className="ml-2 w-48 align-middle" />
                </label>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-400"><th>Facility</th><th>Coverage now</th><th>Projected</th><th>Gap vs ETA</th><th>Signal</th></tr></thead>
                <tbody>
                  {amox.map((r) => {
                    const proj = r.stock / (r.daily_consumption * (1 + forecastSurge / 100));
                    const gap = r.eta_days - proj;
                    return (
                      <tr key={r.facility_id} className="border-t border-slate-700">
                        <td className="py-1">{r.facility_id}</td><td>{r.coverage_days}d</td>
                        <td>{proj.toFixed(1)}d</td>
                        <td style={{ color: gap > 0 ? "#f87171" : "#34d399" }}>{gap > 0 ? "+" : ""}{gap.toFixed(1)}d</td>
                        <td className="text-xs text-slate-400">{gap > 0 ? "Inventory may not cover replenishment at this trend" : "Buffer holds at this trend"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">Pipeline: current consumption × trend → projected demand → projected coverage → gap vs ETA. Uses the same replenishment window as the active scenario. Trend estimate only — not a validated ML prediction. Synthetic simulation.</p>
            </Card>
          </div>
        )}

        {tab === "simulator" && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Disruption — What happens next?">
              <div className="space-y-3 text-sm">
                <label className="block">Supplier
                  <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="mt-1 w-full rounded bg-slate-900 p-2">
                    {SUPPLIERS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="block">Delay: <b>{delay} days</b>
                  <input type="range" min={0} max={14} value={delay} onChange={(e) => setDelay(Number(e.target.value))} className="w-full" />
                </label>
                <label className="block">Demand surge: <b>+{demand}%</b>
                  <input type="range" min={0} max={50} step={5} value={demand} onChange={(e) => setDemand(Number(e.target.value))} className="w-full" />
                </label>
                <p className="text-xs text-slate-400">Medicine: Amoxicillin 500mg</p>
                <button onClick={runSim} disabled={loading} className="w-full rounded-lg bg-violet-600 py-2 font-bold text-white hover:bg-violet-500 disabled:opacity-50">
                  {loading ? "SIMULATING…" : "RUN SIMULATION"}
                </button>
                {sim && <p className="text-xs text-slate-400">Engine: {engine} · Regional {sim.regional_before.label} → <b>{sim.regional_after.label}</b></p>}
              </div>
            </Card>
            <div className="md:col-span-2">
              <Card title="Cascade Propagation">
                {sim && <CascadeGraph risks={risks} affected={sim.affected_nodes} selected={selected} onSelect={setSelected} pulse={sim.affected_nodes.length > 0} reveal={reveal} />}
                <Legend />
              </Card>
            </div>
            {sim && (
              <>
                <Card title="Cascade Timeline">
                  <Timeline steps={sim.timeline} shown={tlShown ?? undefined} />
                </Card>
                <Card title="Regional Impact" wide>
                  <div className="mb-3"><ExposureCard before={sim.regional_before} after={sim.regional_after} /></div>
                  <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                    <div className="rounded bg-slate-900 p-2">High-risk: {sim.regional_before.high} → <b>{sim.regional_after.high}</b></div>
                    <div className="rounded border border-emerald-800 bg-emerald-950/50 p-2">
                      <b className="text-emerald-300">Surplus opportunity</b>
                      <p className="text-xs">{sim.surplus.length ? sim.surplus.map((s) => `${s.facility_id} (${s.excess_days}d excess)`).join(", ") : "none"} — potential redistribution candidate</p>
                    </div>
                    <div className="rounded bg-slate-900 p-2">Engine: <b>{engine}</b></div>
                    <div className="rounded bg-slate-900 p-2">Medicine: Amoxicillin 500mg</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sim.surplus.some((s) => s.facility_id === "hB") && (
                      <button onClick={() => { setTab("interventions"); runInterventions(); }} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500">
                        Use surplus: B → A
                      </button>
                    )}
                    <button onClick={() => { setTab("interventions"); runInterventions(); }} className="rounded-lg border border-violet-500 px-3 py-1.5 text-sm text-violet-300 hover:bg-violet-900">
                      Compare interventions →
                    </button>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {tab === "interventions" && sim && (
          <>
            <div className="rounded-xl border border-amber-600/60 bg-amber-950/40 px-4 py-2.5 text-sm">
              <b className="text-amber-200">SIMULATED TRADE-OFF.</b> <span className="text-slate-300">Every action moves risk somewhere in the network — compare coverage, risk and exposure before deciding.</span> <b className="text-amber-200">Human decision required.</b> <span className="text-slate-500">No intervention is labeled best, optimal or guaranteed.</span>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-slate-400">Scenario: {NODE_LABEL[supplier]} +{delay}d · Amoxicillin 500mg · Engine {engine}</p>
              <button onClick={() => runInterventions()} className="ml-auto rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500">RUN COMPARISON</button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Card title="C — No Intervention">
                <p className="text-sm">High-risk: <b>{sim.regional_after.high}</b> · Exposure: <b>{sim.regional_after.label} ({sim.regional_after.score}%)</b></p>
                <p className="mt-1 text-xs text-slate-400">Affected facilities: {sim.affected_nodes.filter((n) => !n.startsWith("s_") && n !== "w_cdc").join(", ") || "none"} · Hospital A stays {byId.hA ? stateLabel(byId.hA.state) : "—"} ({byId.hA?.score}). Baseline cascade with current delay of {delay}d on {NODE_LABEL[supplier]}.</p>
              </Card>
              <Card title="A — Redistribute Surplus (B→A, 1500u)">
                {!redist && <p className="text-sm text-slate-400">Click RUN COMPARISON.</p>}
                {redist && (() => {
                  const a = redist.after.find((r) => r.facility_id === "hA" && r.medicine_id === "m_amox")!;
                  const b = redist.after.find((r) => r.facility_id === "hB" && r.medicine_id === "m_amox")!;
                  const aUp = redist.tradeoff.hA_after > redist.tradeoff.hA_before;
                  const bDown = redist.tradeoff.hB_after < redist.tradeoff.hB_before;
                  return (
                    <div className="text-sm">
                      <p>Affected: <b>hA, hB</b> · Moved: <b>{redist.moved?.toFixed(0)} units</b> · Exposure: {sim.regional_after.label} ({sim.regional_after.score}%) → <b>{redist.regional.label} ({redist.regional.score}%)</b></p>
                      <p className="mt-1">Hospital A: <RiskBadge state={a.state} /> cov {redist.tradeoff.hA_before.toFixed(1)}d → <b style={{ color: aUp ? "#34d399" : "#f87171" }}>{aUp ? "▲ " : ""}{redist.tradeoff.hA_after.toFixed(1)}d</b> · score {byId.hA?.score} → <b>{a.score}</b></p>
                      <p>Hospital B: <RiskBadge state={b.state} /> cov {redist.tradeoff.hB_before.toFixed(1)}d → <b style={{ color: bDown ? "#fbbf24" : "#34d399" }}>{bDown ? "▼ " : ""}{redist.tradeoff.hB_after.toFixed(1)}d</b> · score {byId.hB?.score} → <b>{b.score}</b></p>
                      <p className="mt-2 rounded bg-slate-900 p-2 text-xs"><b className="text-amber-300">SIMULATED TRADE-OFF:</b> Hospital A improves, <b>BUT</b> Hospital B loses {(redist.tradeoff.hB_before - redist.tradeoff.hB_after).toFixed(1)}d of buffer. Human decision required.</p>
                    </div>
                  );
                })()}
              </Card>
              <Card title="B — Alternative Supplier (Beta→A)">
                {!altSup && <p className="text-sm text-slate-400">Click RUN COMPARISON.</p>}
                {altSup && (() => {
                  const a = altSup.after.find((r) => r.facility_id === "hA" && r.medicine_id === "m_amox")!;
                  return (
                    <div className="text-sm">
                      <p>Affected: <b>hA</b> · Exposure: {sim.regional_after.label} ({sim.regional_after.score}%) → <b>{altSup.regional.label} ({altSup.regional.score}%)</b></p>
                      <p className="mt-1">Hospital A: <RiskBadge state={a.state} /> score {altSup.tradeoff.hA_before.toFixed(0)} → <b>{altSup.tradeoff.hA_after.toFixed(0)}</b> · supplier Alpha → <b>Beta</b> (ETA +1d, no disruption exposure)</p>
                      <p className="mt-2 rounded bg-slate-900 p-2 text-xs"><b className="text-amber-300">SIMULATED TRADE-OFF:</b> disruption exposure clears, but requires contracting action and adds lead time. Human decision required.</p>
                    </div>
                  );
                })()}
              </Card>
            </div>
            {(redist || altSup) && (
              <Card title="Coverage Before → After (Hospital A vs B)">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: "A before", cov: byId.hA?.coverage_days ?? 0 },
                      { name: "A redist", cov: redist ? redist.after.find((r) => r.facility_id === "hA")!.coverage_days : 0 },
                      { name: "A alt-sup", cov: altSup ? altSup.after.find((r) => r.facility_id === "hA")!.coverage_days : 0 },
                      { name: "B before", cov: byId.hB?.coverage_days ?? 0 },
                      { name: "B redist", cov: redist ? redist.after.find((r) => r.facility_id === "hB")!.coverage_days : 0 },
                    ]}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis dataKey="name" stroke="#cbd5e1" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                      <Bar dataKey="cov" fill="#a78bfa" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
          </>
        )}

        {tab === "alerts" && sim && (
          <div className="grid gap-3 md:grid-cols-2">
            {sim.alerts.map((a, i) => {
              const fid = (/^(h[A-D]|rmc|dh|ch)\b/.exec(a.detail)?.[1]) ?? null;
              const ev = fid ? risks.find((r) => r.facility_id === fid && r.medicine_id === "m_amox") : undefined;
              const evBefore = fid ? sim.before.find((b) => b.facility_id === fid && b.medicine_id === "m_amox") : undefined;
              return (
                <div key={i} className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 text-sm">
                  <p className="flex items-center gap-1 font-bold text-amber-300"><AlertTriangle size={14} /> {a.title}{fid ? ` — ${NODE_LABEL[fid] ?? fid}` : ""}</p>
                  <p className="mt-1">{a.detail}</p>
                  <button onClick={() => setWhyOpen(whyOpen === `${i}` ? null : `${i}`)} className="mt-2 text-xs text-violet-300 underline">Why? Show evidence</button>
                  {whyOpen === `${i}` && (
                    <div className="mt-2">
                      {ev ? <FacilityEvidence risk={ev} before={evBefore} />
                        : <p className="rounded bg-slate-900 p-2 text-xs text-slate-300">{a.why}</p>}
                    </div>
                  )}
                </div>
              );
            })}
            {sim.alerts.length === 0 && <p className="text-sm text-slate-400">No alerts at baseline. Run a disruption in the Simulator.</p>}
          </div>
        )}

        <footer className="flex items-center gap-2 border-t border-slate-800 pt-3 text-xs text-slate-500">
          <Boxes size={12} /> Prototype data: demonstration uses synthetic regional operational data. Not real hospital inventory. Decision-support only — humans remain in control. No 100% prediction claims.
        </footer>
      </main>
    </div>
  );
}
