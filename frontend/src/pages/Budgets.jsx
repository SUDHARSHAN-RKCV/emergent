import React, { useEffect, useState, useCallback } from "react";
import api, { formatMoney } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { Trash2, Target, AlertTriangle } from "lucide-react";

export default function Budgets() {
  const { user } = useAuth();
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [catId, setCatId] = useState("");
  const [limit, setLimit] = useState("");
  const canEdit = user?.role === "owner" || user?.role === "editor";
  const currency = user?.preferred_currency || "INR";

  const load = useCallback(async () => {
    const [b, c] = await Promise.all([api.get("/budgets"), api.get("/categories")]);
    setBudgets(b.data);
    setCategories(c.data.filter((x) => x.kind === "expense"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!catId || !limit) return;
    try {
      await api.post("/budgets", { category_id: catId, monthly_limit: parseFloat(limit), currency });
      toast.success("Budget set");
      setCatId(""); setLimit("");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const del = async (id) => {
    if (!window.confirm("Remove this budget?")) return;
    await api.delete(`/budgets/${id}`);
    load();
  };

  const usedCatIds = new Set(budgets.map((b) => b.category_id));
  const availableCats = categories.filter((c) => !usedCatIds.has(c.id));

  return (
    <div className="p-10" data-testid="budgets-page">
      <PageHeader subtitle="Spend smarter" title="Monthly budgets" />

      {canEdit && (
        <div className="card-flat p-6 mb-6" data-testid="add-budget-form">
          <div className="label-caps mb-1">New</div>
          <h3 className="font-heading text-xl font-bold mb-4">Set monthly limit</h3>
          <form onSubmit={add} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="label-caps block mb-2">Category</label>
              <select data-testid="budget-cat-select" required value={catId} onChange={(e) => setCatId(e.target.value)} className="input-flat">
                <option value="">— Select expense category —</option>
                {availableCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="label-caps block mb-2">Monthly limit</label>
              <input data-testid="budget-limit-input" required type="number" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} className="input-flat font-mono" placeholder="0.00" />
            </div>
            <button type="submit" data-testid="budget-add-btn" className="btn-primary">+ Add budget</button>
          </form>
        </div>
      )}

      {budgets.length === 0 ? (
        <div className="card-flat p-16 text-center" data-testid="budgets-empty">
          <Target className="w-10 h-10 mx-auto mb-4 text-[var(--text-secondary)]" strokeWidth={1.5} />
          <h3 className="font-heading text-2xl font-bold mb-2">No budgets yet</h3>
          <p className="text-[var(--text-secondary)] text-sm">Set monthly limits per category to track overspending.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {budgets.map((b) => {
            const pct = Math.min(100, b.progress_pct || 0);
            const over = b.over_budget;
            return (
              <div key={b.id} className="card-flat p-6" data-testid={`budget-card-${b.id}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="label-caps mb-1">Monthly</div>
                    <h3 className="font-heading text-xl font-bold">{b.category_name}</h3>
                  </div>
                  {canEdit && (
                    <button onClick={() => del(b.id)} data-testid={`delete-budget-${b.id}`} className="p-2 hover:bg-[var(--bg)]">
                      <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
                <div className="flex items-baseline justify-between mb-2">
                  <div className="font-mono text-2xl font-medium" style={{ color: over ? "var(--expense)" : "var(--text)" }}>
                    {formatMoney(b.spent_this_month, b.currency || currency)}
                  </div>
                  <div className="font-mono text-sm text-[var(--text-secondary)]">
                    / {formatMoney(b.monthly_limit, b.currency || currency)}
                  </div>
                </div>
                <div className="w-full h-2 bg-[var(--bg)] border border-[var(--border)] mb-2">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${Math.min(100, pct)}%`, background: over ? "var(--expense)" : "var(--income)" }}
                    data-testid={`budget-progress-${b.id}`}
                  />
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[var(--text-secondary)]">{(b.progress_pct || 0).toFixed(0)}% used</span>
                  {over ? (
                    <span className="flex items-center gap-1 text-[var(--expense)] font-semibold">
                      <AlertTriangle className="w-3 h-3" strokeWidth={2} /> Over by {formatMoney(b.spent_this_month - b.monthly_limit, b.currency || currency)}
                    </span>
                  ) : (
                    <span className="text-[var(--income)]">{formatMoney(b.remaining, b.currency || currency)} left</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
