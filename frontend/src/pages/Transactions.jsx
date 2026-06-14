import React, { useEffect, useState } from "react";
import api, { formatMoney } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { Trash2, Pencil } from "lucide-react";

export default function Transactions() {
  const { user } = useAuth();
  const [txns, setTxns] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filterType, setFilterType] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterRecurrent, setFilterRecurrent] = useState("");
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const canEdit = user?.role === "owner" || user?.role === "editor";
  const currency = user?.preferred_currency || "INR";

  const load = async () => {
    const params = new URLSearchParams();
    if (filterType) params.append("type", filterType);
    if (filterAccount) params.append("account_id", filterAccount);
    if (filterCategory) params.append("category_id", filterCategory);
    if (filterRecurrent) params.append("is_recurrent", filterRecurrent);
    const [t, a, c] = await Promise.all([
      api.get(`/transactions?${params.toString()}`),
      api.get("/accounts"),
      api.get("/categories"),
    ]);
    setTxns(t.data);
    setAccounts(a.data);
    setCategories(c.data);
  };

  useEffect(() => { load(); }, [filterType, filterAccount, filterCategory, filterRecurrent]);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this transaction?")) return;
    await api.delete(`/transactions/${id}`);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="p-10" data-testid="transactions-page">
      <PageHeader
        subtitle="All movements"
        title="Transactions"
        action={canEdit && <button data-testid="add-txn-btn" onClick={() => { setEditing(null); setOpen(true); }} className="btn-primary">+ New transaction</button>}
      />

      {/* Filters */}
      <div className="card-flat p-4 mb-6 flex flex-wrap gap-3 items-center" data-testid="txn-filters">
        <span className="label-caps">Filter:</span>
        <select data-testid="filter-type" value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-flat w-auto py-2 text-sm">
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select data-testid="filter-account" value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} className="input-flat w-auto py-2 text-sm">
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select data-testid="filter-category" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="input-flat w-auto py-2 text-sm">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select data-testid="filter-recurrent" value={filterRecurrent} onChange={(e) => setFilterRecurrent(e.target.value)} className="input-flat w-auto py-2 text-sm">
          <option value="">All</option>
          <option value="true">Recurring only</option>
          <option value="false">One-time only</option>
        </select>
      </div>

      <div className="card-flat overflow-hidden" data-testid="txn-table-wrap">
        {txns.length === 0 ? (
          <div className="p-16 text-center">
            <div className="label-caps mb-3">Empty</div>
            <h3 className="font-heading text-2xl font-bold mb-2">No transactions yet</h3>
            <p className="text-[var(--text-secondary)] text-sm">Click "+ New transaction" to log your first expense or income.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--bg)]">
                <tr>
                  <th className="label-caps text-left px-5 py-3">Date</th>
                  <th className="label-caps text-left px-5 py-3">Name</th>
                  <th className="label-caps text-left px-5 py-3">Category</th>
                  <th className="label-caps text-left px-5 py-3">Account</th>
                  <th className="label-caps text-right px-5 py-3">Unit ₽</th>
                  <th className="label-caps text-right px-5 py-3">Qty</th>
                  <th className="label-caps text-right px-5 py-3">Total</th>
                  {canEdit && <th className="label-caps text-right px-5 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => {
                  const acc = accounts.find((a) => a.id === t.account_id);
                  return (
                    <tr key={t.id} className="border-t border-[var(--border)] hover:bg-[var(--bg)]/50" data-testid={`txn-row-${t.id}`}>
                      <td className="px-5 py-3 font-mono text-sm">{t.date}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={t.type === "income" ? "badge-income" : "badge-expense"}>{t.type}</span>
                          <span className="text-sm font-medium">{t.name}</span>
                          {t.is_recurrent && <span className="badge-recurrent">↻ {t.recurrence_period || "monthly"}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">{t.category_name || "—"}</td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">{acc?.name || "—"}</td>
                      <td className="px-5 py-3 text-right font-mono text-sm">{formatMoney(t.unit_price, currency)}</td>
                      <td className="px-5 py-3 text-right font-mono text-sm">{t.quantity}</td>
                      <td className={`px-5 py-3 text-right font-mono text-sm font-medium ${t.type === "income" ? "text-[var(--income)]" : "text-[var(--expense)]"}`}>
                        {t.type === "income" ? "+" : "−"} {formatMoney(t.billed_amount, currency)}
                      </td>
                      {canEdit && (
                        <td className="px-5 py-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => { setEditing(t); setOpen(true); }} data-testid={`edit-txn-${t.id}`} className="p-1.5 hover:bg-[var(--border)]"><Pencil className="w-4 h-4" strokeWidth={1.5} /></button>
                            <button onClick={() => handleDelete(t.id)} data-testid={`delete-txn-${t.id}`} className="p-1.5 hover:bg-[var(--border)]"><Trash2 className="w-4 h-4" strokeWidth={1.5} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <TxnModal
          initial={editing}
          accounts={accounts}
          categories={categories}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function TxnModal({ initial, accounts, categories, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState(initial?.type || "expense");
  const [name, setName] = useState(initial?.name || "");
  const [date, setDate] = useState(initial?.date || today);
  const [unitPrice, setUnitPrice] = useState(initial?.unit_price ?? 0);
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [billed, setBilled] = useState(initial?.billed_amount ?? 0);
  const [autoBilled, setAutoBilled] = useState(!initial);
  const [categoryId, setCategoryId] = useState(initial?.category_id || "");
  const [accountId, setAccountId] = useState(initial?.account_id || accounts[0]?.id || "");
  const [isRecurrent, setIsRecurrent] = useState(initial?.is_recurrent || false);
  const [recurrencePeriod, setRecurrencePeriod] = useState(initial?.recurrence_period || "monthly");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (autoBilled) {
      setBilled((parseFloat(unitPrice) || 0) * (parseFloat(quantity) || 0));
    }
  }, [unitPrice, quantity, autoBilled]);

  const filteredCats = categories.filter((c) => c.kind === type);

  const save = async (e) => {
    e.preventDefault();
    if (!accountId) { toast.error("Please create an account first"); return; }
    setSaving(true);
    try {
      const cat = filteredCats.find((c) => c.id === categoryId);
      const payload = {
        type, name, date,
        unit_price: parseFloat(unitPrice) || 0,
        quantity: parseFloat(quantity) || 1,
        billed_amount: parseFloat(billed) || 0,
        category_id: categoryId || null,
        category_name: cat?.name || null,
        account_id: accountId,
        is_recurrent: isRecurrent,
        recurrence_period: isRecurrent ? recurrencePeriod : null,
        notes: notes || null,
      };
      if (initial) await api.put(`/transactions/${initial.id}`, payload);
      else await api.post("/transactions", payload);
      toast.success(initial ? "Updated" : "Created");
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#1C1C1A]/40 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="card-flat p-8 w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()} data-testid="txn-modal">
        <div className="label-caps mb-2">{initial ? "Edit" : "New"}</div>
        <h2 className="font-heading text-3xl font-black tracking-tighter mb-6">{initial ? "Edit transaction" : "New transaction"}</h2>

        <div className="flex gap-2 mb-6">
          <button type="button" onClick={() => setType("expense")} data-testid="type-expense-btn" className={`flex-1 py-2.5 border ${type === "expense" ? "bg-[var(--expense-bg)] text-[var(--expense)] border-[var(--expense)] font-semibold" : "border-[var(--border)] text-[var(--text-secondary)]"}`}>Expense</button>
          <button type="button" onClick={() => setType("income")} data-testid="type-income-btn" className={`flex-1 py-2.5 border ${type === "income" ? "bg-[var(--income-bg)] text-[var(--income)] border-[var(--income)] font-semibold" : "border-[var(--border)] text-[var(--text-secondary)]"}`}>Income</button>
        </div>

        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-caps block mb-2">Name *</label>
              <input data-testid="txn-name-input" required value={name} onChange={(e) => setName(e.target.value)} className="input-flat" placeholder="e.g. Onions 1kg" />
            </div>
            <div>
              <label className="label-caps block mb-2">Date *</label>
              <input data-testid="txn-date-input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input-flat font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label-caps block mb-2">Unit price</label>
              <input data-testid="txn-unit-input" type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="input-flat font-mono" />
            </div>
            <div>
              <label className="label-caps block mb-2">Quantity</label>
              <input data-testid="txn-qty-input" type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input-flat font-mono" />
            </div>
            <div>
              <label className="label-caps block mb-2">Billed amount *</label>
              <input
                data-testid="txn-billed-input"
                required type="number" step="0.01"
                value={billed}
                onChange={(e) => { setBilled(e.target.value); setAutoBilled(false); }}
                className="input-flat font-mono font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-caps block mb-2">Category</label>
              <select data-testid="txn-category-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input-flat">
                <option value="">— None —</option>
                {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label-caps block mb-2">Account *</label>
              <select data-testid="txn-account-select" required value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input-flat">
                <option value="">— Select —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          <div className="border border-[var(--border)] p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input data-testid="txn-recurrent-checkbox" type="checkbox" checked={isRecurrent} onChange={(e) => setIsRecurrent(e.target.checked)} className="w-4 h-4 accent-[var(--primary)]" />
              <span className="text-sm font-medium">Recurring transaction</span>
            </label>
            {isRecurrent && (
              <div className="mt-3 pl-7">
                <label className="label-caps block mb-2">Frequency</label>
                <select data-testid="txn-recurrence-select" value={recurrencePeriod} onChange={(e) => setRecurrencePeriod(e.target.value)} className="input-flat">
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="label-caps block mb-2">Notes</label>
            <textarea data-testid="txn-notes-input" value={notes} onChange={(e) => setNotes(e.target.value)} className="input-flat" rows={2} />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} data-testid="txn-save-btn" className="btn-primary flex-1 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
