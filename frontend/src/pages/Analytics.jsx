import React, { useEffect, useState } from "react";
import api, { formatMoney } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";

const PIE_COLORS = ["#2D5A27", "#9B3922", "#C28A2B", "#2C3E2D", "#1C1C1A", "#5A4B8B", "#2A5B7A", "#6E6D68"];

export default function Analytics() {
  const { user } = useAuth();
  const [trends, setTrends] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [unitPrices, setUnitPrices] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [months, setMonths] = useState(6);
  const [breakdownType, setBreakdownType] = useState("expense");
  const currency = user?.preferred_currency || "INR";

  useEffect(() => {
    (async () => {
      const [t, b, u, r] = await Promise.all([
        api.get(`/analytics/trends?months=${months}`),
        api.get(`/analytics/category-breakdown?type=${breakdownType}`),
        api.get("/analytics/unit-prices"),
        api.get("/analytics/recurring"),
      ]);
      setTrends(t.data);
      setBreakdown(b.data);
      setUnitPrices(u.data);
      setRecurring(r.data);
    })();
  }, [months, breakdownType]);

  // Recurring monthly normalized
  const recurringMonthlyTotal = recurring.reduce((sum, t) => {
    if (t.type !== "expense") return sum;
    const p = t.recurrence_period || "monthly";
    const a = t.billed_amount;
    if (p === "weekly") return sum + a * 4.345;
    if (p === "yearly") return sum + a / 12;
    return sum + a;
  }, 0);

  return (
    <div className="p-10" data-testid="analytics-page">
      <PageHeader subtitle="Insights" title="Analytics" />

      {/* Trends */}
      <div className="card-flat p-6 mb-6" data-testid="trends-card">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="label-caps mb-1">Trends</div>
            <h3 className="font-heading text-xl font-bold">Income · Expense · Net</h3>
          </div>
          <select data-testid="months-select" value={months} onChange={(e) => setMonths(parseInt(e.target.value))} className="input-flat w-auto py-2 text-sm">
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
          </select>
        </div>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={trends}>
              <CartesianGrid stroke="#E6E5E0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: "#5A5955" }} axisLine={{ stroke: "#E6E5E0" }} tickLine={false} />
              <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: "#5A5955" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1C1C1A", color: "#fff", border: "none", borderRadius: 0, fontFamily: "IBM Plex Mono", fontSize: 12 }} formatter={(v) => formatMoney(v, currency)} />
              <Legend wrapperStyle={{ fontFamily: "Manrope", fontSize: 12 }} />
              <Bar dataKey="income" fill="#2D5A27" />
              <Bar dataKey="expense" fill="#9B3922" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category breakdown + Net trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card-flat p-6" data-testid="breakdown-card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="label-caps mb-1">Distribution</div>
              <h3 className="font-heading text-xl font-bold">Category split</h3>
            </div>
            <select data-testid="breakdown-type-select" value={breakdownType} onChange={(e) => setBreakdownType(e.target.value)} className="input-flat w-auto py-2 text-sm">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          {breakdown.length === 0 ? (
            <div className="text-sm text-[var(--text-secondary)] py-8 text-center">No data yet.</div>
          ) : (
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={breakdown} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={100} stroke="#F4F3EF">
                    {breakdown.map((entry, i) => <Cell key={entry.category} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1C1C1A", color: "#fff", border: "none", borderRadius: 0, fontFamily: "IBM Plex Mono", fontSize: 12 }} formatter={(v) => formatMoney(v, currency)} />
                  <Legend wrapperStyle={{ fontFamily: "Manrope", fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card-flat p-6" data-testid="net-card">
          <div className="label-caps mb-1">Cash flow</div>
          <h3 className="font-heading text-xl font-bold mb-6">Net monthly</h3>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={trends}>
                <CartesianGrid stroke="#E6E5E0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: "#5A5955" }} axisLine={{ stroke: "#E6E5E0" }} tickLine={false} />
                <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: "#5A5955" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1C1C1A", color: "#fff", border: "none", borderRadius: 0, fontFamily: "IBM Plex Mono", fontSize: 12 }} formatter={(v) => formatMoney(v, currency)} />
                <Line type="monotone" dataKey="net" stroke="#2C3E2D" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Unit price drift */}
      <div className="card-flat p-6 mb-6" data-testid="unit-prices-card">
        <div className="label-caps mb-1">Inflation tracker</div>
        <h3 className="font-heading text-xl font-bold mb-6">Unit price change over time</h3>
        {unitPrices.length === 0 ? (
          <div className="text-sm text-[var(--text-secondary)] py-6">
            Track the same item (e.g. "Milk 1L", "Petrol/L") at least twice to see how the unit price evolves.
          </div>
        ) : (
          <div className="space-y-8">
            {unitPrices.slice(0, 6).map((item, idx) => {
              const first = item.points[0].unit_price;
              const last = item.points[item.points.length - 1].unit_price;
              const change = first ? ((last - first) / first) * 100 : 0;
              return (
                <div key={item.name} data-testid={`unit-price-${idx}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-base">{item.name}</h4>
                      <div className="font-mono text-xs text-[var(--text-secondary)]">{item.points.length} data points</div>
                    </div>
                    <div className={`font-mono text-sm font-semibold ${change >= 0 ? "text-[var(--expense)]" : "text-[var(--income)]"}`}>
                      {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ width: "100%", height: 120 }}>
                    <ResponsiveContainer>
                      <LineChart data={item.points}>
                        <XAxis dataKey="date" tick={{ fontFamily: "IBM Plex Mono", fontSize: 10, fill: "#5A5955" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 10, fill: "#5A5955" }} axisLine={false} tickLine={false} width={50} />
                        <Tooltip contentStyle={{ background: "#1C1C1A", color: "#fff", border: "none", borderRadius: 0, fontFamily: "IBM Plex Mono", fontSize: 11 }} formatter={(v) => formatMoney(v, currency)} />
                        <Line type="monotone" dataKey="unit_price" stroke="#C28A2B" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recurring */}
      <div className="card-flat p-6" data-testid="recurring-card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="label-caps mb-1">Subscriptions &amp; bills</div>
            <h3 className="font-heading text-xl font-bold">Recurring expenses</h3>
          </div>
          <div className="text-right">
            <div className="label-caps">Monthly burn</div>
            <div className="font-mono text-2xl font-medium text-[var(--expense)]">{formatMoney(recurringMonthlyTotal, currency)}</div>
          </div>
        </div>
        {recurring.length === 0 ? (
          <div className="text-sm text-[var(--text-secondary)] py-4">No recurring transactions tagged yet.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="label-caps text-left py-3">Item</th>
                <th className="label-caps text-left py-3">Category</th>
                <th className="label-caps text-left py-3">Frequency</th>
                <th className="label-caps text-right py-3">Amount</th>
                <th className="label-caps text-right py-3">~ Monthly</th>
              </tr>
            </thead>
            <tbody>
              {recurring.filter((t) => t.type === "expense").map((t) => {
                const p = t.recurrence_period || "monthly";
                const a = t.billed_amount;
                const monthly = p === "weekly" ? a * 4.345 : p === "yearly" ? a / 12 : a;
                return (
                  <tr key={t.id} className="border-b border-[var(--border)] last:border-0" data-testid={`recurring-row-${t.id}`}>
                    <td className="py-3 font-medium text-sm">{t.name}</td>
                    <td className="py-3 text-sm text-[var(--text-secondary)]">{t.category_name || "—"}</td>
                    <td className="py-3"><span className="badge-recurrent">{p}</span></td>
                    <td className="py-3 text-right font-mono text-sm">{formatMoney(a, currency)}</td>
                    <td className="py-3 text-right font-mono text-sm font-semibold">{formatMoney(monthly, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
