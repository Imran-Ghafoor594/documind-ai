import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CurrencySummary } from "../api";
import { money, monthLabel } from "../lib/format";

const COLORS = ["#d6402b", "#2b2d33", "#f7765d", "#747882", "#ffc5ba", "#b33121", "#9a9ea8", "#8f281b"];

export function MonthlyChart({ summary }: { summary: CurrencySummary }) {
  const data = summary.monthly.map((m) => ({ month: monthLabel(m.month), total: Number(m.total) }));
  if (!data.length) return <p className="py-10 text-center text-sm text-ink-600">No dated expenses yet.{summary.undated_count > 0 && ` ${summary.undated_count} confirmed record(s) have no date.`}</p>;
  return (
    <div className="h-64 w-full" role="img" aria-label={`Monthly confirmed spending in ${summary.currency}: ${summary.monthly.map((m) => `${m.month} ${m.total}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e1e2e6" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#5a5e68" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12, fill: "#5a5e68" }} tickLine={false} axisLine={false} width={56} />
          <Tooltip formatter={(v: number) => money(String(v), summary.currency)} cursor={{ fill: "#eeeff1" }} />
          <Bar dataKey="total" fill="#d6402b" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryChart({ summary }: { summary: CurrencySummary }) {
  const data = summary.categories.map((c) => ({ name: c.category, value: Number(c.total) }));
  if (!data.length) return <p className="py-10 text-center text-sm text-ink-600">No confirmed expenses yet.</p>;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <div className="h-44 w-44 shrink-0" role="img" aria-label={`Spending by category in ${summary.currency}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={76} paddingAngle={data.length > 1 ? 2 : 0}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie>
            <Tooltip formatter={(v: number) => money(String(v), summary.currency)} /></PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
        {summary.categories.map((c, i) => (
          <li key={c.category} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} aria-hidden /><span className="truncate">{c.category}</span></span>
            <span className="tabular-nums text-ink-700">{money(c.total, summary.currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CurrencyTabs({ items, value, onChange }: { items: string[]; value: string; onChange: (c: string) => void }) {
  if (items.length < 2) return null;
  return (
    <div role="tablist" aria-label="Currency" className="inline-flex max-w-full overflow-x-auto rounded-lg border border-ink-200 bg-ink-100 p-0.5">
      {items.map((c) => (
        <button key={c} role="tab" aria-selected={c === value} onClick={() => onChange(c)}
          className={`rounded-md px-3 py-1 text-sm font-medium ${c === value ? "bg-white text-ink-900 shadow-card" : "text-ink-600 hover:text-ink-900"}`}>{c}</button>
      ))}
    </div>
  );
}

/** Horizontal share bars: each row's bar is its share of the currency total. */
export function ShareBars({ rows, total, currency }: { rows: { label: string; total: string; count: number }[]; total: string; currency: string }) {
  const sum = Number(total) || 1;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 truncate font-medium">{r.label}</span><span className="shrink-0 tabular-nums">{money(r.total, currency)} <span className="text-xs text-ink-600">· {r.count}</span></span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(2, Math.round((Number(r.total) / sum) * 100))}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
