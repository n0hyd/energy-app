import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Settings, Download, Building2, LineChart, ChevronDown } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  BarChart,
  Bar,
  Legend,
  ReferenceLine,
} from "recharts";
import { motion } from "framer-motion";

// ---------- Mock Data ---------------------------------------------------------
const kpi = {
  totalCost: 2310000, // $
  totalBtu: 37_800_000_000, // Btu
  avgSiteEui: 68.2,
  avgScore: 79,
  pctBelowMedian: -12, // %
  updated: "Updated Oct 29, 2025",
};

const months = [
  "Nov 2023","Dec 2023","Jan 2024","Feb 2024","Mar 2024","Apr 2024","May 2024","Jun 2024","Jul 2024","Aug 2024","Sep 2024","Oct 2024",
  "Nov 2024","Dec 2024","Jan 2025","Feb 2025","Mar 2025","Apr 2025","May 2025","Jun 2025","Jul 2025","Aug 2025","Sep 2025","Oct 2025",
];

const trend = months.map((m, i) => ({
  month: m,
  siteEui: 64 + Math.sin(i / 2) * 6 + (i > 12 ? -2 : 0),
  sourceEui: 160 + Math.sin(i / 2) * 12 + (i > 12 ? -3 : 0),
  cost: 180000 + Math.cos(i / 3) * 30000 + (i > 12 ? -10000 : 0),
  // Mock CBECS band
  p25: 55,
  p75: 80,
}));

const buildings = [
  { id: "b1", name: "Derby High School", type: "Education", eui: 78, pmMedian: 68, score: 72, cost: 640000, elecShare: 0.58 },
  { id: "b2", name: "Middle School", type: "Education", eui: 61, pmMedian: 68, score: 85, cost: 380000, elecShare: 0.66 },
  { id: "b3", name: "Admin Center", type: "Office", eui: 92, pmMedian: 74, score: 66, cost: 210000, elecShare: 0.47 },
  { id: "b4", name: "Elementary North", type: "Education", eui: 71, pmMedian: 68, score: 78, cost: 295000, elecShare: 0.61 },
  { id: "b5", name: "Elementary South", type: "Education", eui: 65, pmMedian: 68, score: 84, cost: 280000, elecShare: 0.63 },
];

function toCurrency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function btuToDisplay(n: number) {
  // show in billion Btu
  return `${(n / 1_000_000_000).toFixed(1)} billion Btu`;
}

// ---------- KPI Card ----------------------------------------------------------
const KpiCard: React.FC<{ label: string; value: string; icon?: React.ReactNode; tint?: string; sub?: string }>=({ label, value, icon, tint, sub })=>{
  return (
    <Card className={`rounded-2xl shadow-sm ${tint || ""}`}>
      <CardContent className="p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-sm opacity-70">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {sub ? <div className="text-xs opacity-70 mt-1">{sub}</div> : null}
      </CardContent>
    </Card>
  );
};

// ---------- Component ---------------------------------------------------------
export default function DistrictDashboardMock() {
  const [viewSource, setViewSource] = useState(false);
  const [orgFilter, setOrgFilter] = useState("All Buildings");
  const [targetPct, setTargetPct] = useState<number>(20); // slider default

  const savings = useMemo(() => {
    // naive mock savings: if target below median, buildings above that target will save
    const rows = buildings.map((b) => {
      const targetEui = Math.max(0, b.pmMedian * (1 - targetPct / 100));
      const above = Math.max(0, b.eui - targetEui);
      // pretend $/EUI scaling ~ cost / eui
      const dollarsPerEui = b.cost / Math.max(1, b.eui);
      const save$ = above * dollarsPerEui;
      return { ...b, targetEui, save$ };
    });
    const total = rows.reduce((a, r) => a + r.save$, 0);
    return { rows, total };
  }, [targetPct]);

  const buildingEuiData = useMemo(() => buildings.map(b => ({ name: b.name, eui: b.eui, median: b.pmMedian, score: b.score })), []);
  const buildingCostData = useMemo(() => buildings.map(b => ({ name: b.name, cost: b.cost, elecShare: b.elecShare })), []);

  return (
    <div className="w-full min-h-screen bg-base-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-base-200 p-4 rounded-md shadow-sm">
        <div>
          <div className="text-xl font-semibold">District Energy Overview</div>
          <div className="text-xs opacity-70">Fiscal Year 2024–2025 • {kpi.updated}</div>
          <div className="mt-2">
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-56 text-sm">
                <ChevronDown className="mr-2 h-4 w-4" />
                <SelectValue placeholder="All Buildings" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Buildings">All Buildings</SelectItem>
                <SelectItem value="Education">Education</SelectItem>
                <SelectItem value="Office">Office</SelectItem>
                <SelectItem value="Operations">Operations</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-base-100 px-3 py-2 rounded-xl shadow-sm">
            <span className="text-sm">View by Site / Source</span>
            <Switch checked={viewSource} onCheckedChange={setViewSource} />
          </div>
          <Button variant="secondary" className="rounded-xl">
            <Download className="h-4 w-4 mr-2" /> Export PDF
          </Button>
          <Button variant="outline" className="rounded-xl">
            <Settings className="h-4 w-4 mr-2" /> Settings
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
        <KpiCard label="Total Annual Cost" value={toCurrency(kpi.totalCost)} tint="bg-amber-50" icon={<Building2 className="h-4 w-4" />} />
        <KpiCard label="Total Energy Use (Site)" value={btuToDisplay(kpi.totalBtu)} tint="bg-sky-50" />
        <KpiCard label="Average Site EUI" value={`${kpi.avgSiteEui} kBtu/ft²`} tint="bg-slate-50" />
        <KpiCard label="Average ENERGY STAR" value={`${kpi.avgScore}`} tint="bg-green-50" />
        <KpiCard label="% Below Median EUI" value={`${kpi.pctBelowMedian}%`} tint="bg-emerald-50" />
      </div>

      {/* Trend Line */}
      <Card className="mt-6 rounded-2xl">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">District Energy Performance Over Time</div>
            <div className="text-xs opacity-70">Rolling 24 months</div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RLineChart data={trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} interval={2} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} label={{ value: "kBtu/ft²", angle: -90, position: "insideLeft" }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} label={{ value: "$", angle: -90, position: "insideRight" }} />
                <Tooltip formatter={(v:any, n:any)=> n.includes("EUI")? `${v.toFixed?.(1) ?? v}`: toCurrency(v)} />
                {/* Gray band 25th–75th percentile */}
                <ReferenceArea y1={trend[0].p25} y2={trend[0].p75} yAxisId="left" fillOpacity={0.08} />
                <Line yAxisId="left" type="monotone" dataKey="siteEui" dot={false} strokeWidth={2} />
                {viewSource && <Line yAxisId="left" type="monotone" dataKey="sourceEui" dot={false} strokeWidth={2} />}
                <Line yAxisId="right" type="monotone" dataKey="cost" dot={false} strokeWidth={2} />
                <Legend />
              </RLineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Building Comparison Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <div className="font-semibold mb-2">Energy Use Intensity by Building</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buildingEuiData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v:any, n:any)=> n === "median" ? `${v} (PM median)`: v} />
                  <Bar dataKey="eui" barSize={18} />
                  <ReferenceLine x={68} strokeDasharray="4 4" ifOverflow="extendDomain" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs opacity-70 mt-2">Dashed line = PM median for type</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <div className="font-semibold mb-2">Annual Cost by Building</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buildingCostData} margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={false} />
                  <YAxis tickFormatter={(v)=> `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v:any, n:any)=> n === "elecShare" ? `${Math.round(v*100)}% electric` : toCurrency(v)} />
                  <Bar dataKey="cost" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs opacity-70 mt-2">Bar color intensity can reflect electric vs gas mix.</div>
          </CardContent>
        </Card>
      </div>

      {/* Savings Potential */}
      <Card className="rounded-2xl mt-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Savings Potential if Below Median</div>
            <div className="flex items-center gap-3">
              <span className="text-sm">Show potential savings at</span>
              <div className="w-56">
                <Slider value={[targetPct]} onValueChange={(v)=> setTargetPct(v[0])} step={1} min={0} max={50} />
              </div>
              <div className="text-sm font-medium w-10 text-right">{targetPct}%</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <KpiCard label="Total potential savings" value={toCurrency(savings.total)} tint="bg-emerald-50" />
            <KpiCard label="Total energy avoided" value={`${(savings.total/2000).toFixed(0)} MMBtu (mock)" tint="bg-sky-50" />
            <KpiCard label="Estimated CO₂e reduced" value={`${(savings.total/1000).toFixed(0)} tons (mock)" tint="bg-slate-50" />
          </div>

          {/* Small stacked bars per building (mock current vs target) */}
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={savings.rows.map(r => ({ name: r.name, current: r.eui, target: r.targetEui }))} margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={160} />
                <Tooltip />
                <Bar dataKey="current" stackId="a" />
                <Bar dataKey="target" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Buildings Table */}
      <Card className="rounded-2xl mt-6">
        <CardContent className="p-4">
          <div className="font-semibold mb-2">All Buildings Summary</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left opacity-70">
                  <th className="py-2 pr-4">Building</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Site EUI</th>
                  <th className="py-2 pr-4">% vs Median</th>
                  <th className="py-2 pr-4">Annual Cost</th>
                  <th className="py-2 pr-4">ENERGY STAR</th>
                  <th className="py-2 pr-4">Potential Savings (20%)</th>
                </tr>
              </thead>
              <tbody>
                {buildings.map((b) => {
                  const pctVsMedian = ((b.eui - b.pmMedian) / b.pmMedian) * 100;
                  const sampleSavings = Math.max(0, (b.eui - b.pmMedian * 0.8)) * (b.cost/Math.max(1,b.eui));
                  return (
                    <tr key={b.id} className="hover:bg-base-200/60 transition">
                      <td className="py-2 pr-4 font-medium">
                        <a href={`/building/${b.id}`} className="underline">{b.name}</a>
                      </td>
                      <td className="py-2 pr-4">{b.type}</td>
                      <td className="py-2 pr-4">{b.eui}</td>
                      <td className="py-2 pr-4">{pctVsMedian >= 0 ? "+" : ""}{pctVsMedian.toFixed(0)}%</td>
                      <td className="py-2 pr-4">{toCurrency(b.cost)}</td>
                      <td className="py-2 pr-4">{b.score}</td>
                      <td className="py-2 pr-4">{sampleSavings > 0 ? toCurrency(sampleSavings) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-xs opacity-70 italic text-center mt-4">
            District EUI improved 6% vs last year. Gas intensity increased slightly due to colder winter. 3 buildings achieved >10% reduction year-over-year.
          </div>
        </CardContent>
      </Card>

      {/* Optional Sidebar (collapsible placeholder) */}
      <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.4 }} className="fixed left-4 top-28 hidden xl:block">
        <div className="bg-base-200/80 backdrop-blur rounded-2xl shadow px-3 py-3 text-sm">
          <div className="font-semibold mb-2">Navigation</div>
          <ul className="space-y-1">
            <li><a className="hover:underline" href="#">Dashboard</a></li>
            <li><a className="hover:underline" href="#">Buildings</a></li>
            <li><a className="hover:underline" href="#">Uploads</a></li>
            <li><a className="hover:underline" href="#">Benchmarks</a></li>
            <li><a className="hover:underline" href="#">Alerts</a></li>
            <li><a className="hover:underline" href="#">Settings</a></li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
