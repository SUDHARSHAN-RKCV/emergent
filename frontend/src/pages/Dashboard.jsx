import React, { useEffect, useState } from "react";
import api, { formatMoney } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { ArrowDownRight, ArrowUpRight, RotateCw, Wallet } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend } from "recharts";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [recent, setRecent] = useState([]);
  const currency = user?.preferred_currency || "INR";

  useEffect(() => {
    (async () => {
      const [s, t, b, r] = await Promise.all([
        api.get("/analytics/summary"),
        api.get("/analytics/trends?months=6"),
        api.get("/analytics/category-breakdown?type=expense"),
        api.get("/transactions?limit=8"),
      ]);
      setSummary(s.data);
      setTrends(t.data);
      setBreakdown(b.data);
      setRecent(r.data);
    })();
  }, []);

  if (!summary) return <div className="p-10 font-mono text-sm">LOADING…</div>;

  return (
    <div className="p-10" data-testid="dashboard">
      <PageHeader
        subtitle={`Hello, ${user?.name?.split(" ")[0]}`}
        title="Dashboard"
        action={<Link to="/transactions" data-testid="add-txn-link" className="btn-primary">+ New transaction</Link>}
      />

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard label="Total balance" value={formatMoney(summary.total_balance, currency)} icon={Wallet} testid="stat-balance" />
        <StatCard label="This month — income" value={formatMoney(summary.month_income, currency)} icon={ArrowUpRight} accent="income" testid="stat-income" />
        <StatCard label="This month — expense" value={formatMoney(summary.month_expense, currency)} icon={ArrowDownRight} accent="expense" testid="stat-expense" />
        <StatCard label="Recurring · monthly" value={formatMoney(summary.recurring_monthly, currency)} icon={RotateCw} accent="recurrent" testid="stat-recurring" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
        <div className="card-flat p-6 lg:col-span-8" data-testid="trends-chart">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="label-caps mb-1">Trends</div>
              <h3 className="font-heading text-xl font-bold">Income vs Expense · 6 months</h3>
            </div>
          </div>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={trends} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E6E5E0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: "#5A5955" }} axisLine={{ stroke: "#E6E5E0" }} tickLine={false} />
                <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: "#5A5955" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1C1C1A", color: "#fff", border: "none", borderRadius: 0, fontFamily: "IBM Plex Mono", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontFamily: "Manrope", fontSize: 12 }} />
                <Line type="monotone" dataKey="income" stroke="#2D5A27" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="expense" stroke="#9B3922" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-flat p-6 lg:col-span-4" data-testid="breakdown-chart">
          <div className="label-caps mb-1">Breakdown</div>
          <h3 className="font-heading text-xl font-bold mb-6">Top spending categories</h3>
          {breakdown.length === 0 ? (
            <div className="text-sm text-[var(--text-secondary)]">No spending yet.</div>
          ) : (
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={breakdown.slice(0, 6)} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid stroke="#E6E5E0" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontFamily: "IBM Plex Mono", fontSize: 10, fill: "#5A5955" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="category" tick={{ fontFamily: "Manrope", fontSize: 11, fill: "#1C1C1A" }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip contentStyle={{ background: "#1C1C1A", color: "#fff", border: "none", borderRadius: 0, fontFamily: "IBM Plex Mono", fontSize: 12 }} formatter={(v) => formatMoney(v, currency)} />
                  <Bar dataKey="total" fill="#9B3922" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card-flat p-6" data-testid="recent-list">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="label-caps mb-1">Recent activity</div>
            <h3 className="font-heading text-xl font-bold">Latest transactions</h3>
          </div>
          <Link to="/transactions" className="text-sm font-medium underline underline-offset-4">View all</Link>
        </div>
        {recent.length === 0 ? (
          <div className="text-sm text-[var(--text-secondary)] py-6">No transactions yet. Add your first one.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="label-caps text-left py-3">Date</th>
                <th className="label-caps text-left py-3">Name</th>
                <th className="label-caps text-left py-3">Category</th>
                <th className="label-caps text-right py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id} className="border-b border-[var(--border)] last:border-0" data-testid={`recent-txn-${t.id}`}>
                  <td className="py-3 font-mono text-sm">{t.date}</td>
                  <td className="py-3">
                    <div className="font-medium text-sm">{t.name}</div>
                    {t.is_recurrent && <span className="badge-recurrent mt-1">Recurring</span>}
                  </td>
                  <td className="py-3 text-sm text-[var(--text-secondary)]">{t.category_name || "—"}</td>
                  <td className={`py-3 text-right font-mono text-sm font-medium ${t.type === "income" ? "text-[var(--income)]" : "text-[var(--expense)]"}`}>
                    {t.type === "income" ? "+" : "−"} {formatMoney(t.billed_amount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent, testid }) {
  const colorMap = { income: "var(--income)", expense: "var(--expense)", recurrent: "var(--recurrent)" };
  return (
    <div className="card-flat p-6" data-testid={testid}>
      <div className="flex items-center justify-between mb-4">
        <div className="label-caps">{label}</div>
        <Icon className="w-4 h-4 text-[var(--text-secondary)]" strokeWidth={1.5} />
      </div>
      <div className="font-mono text-3xl font-medium tracking-tight" style={{ color: accent ? colorMap[accent] : "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}
