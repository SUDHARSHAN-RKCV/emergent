import React, { useEffect, useState, useCallback } from "react";
import api, { formatMoney } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { Building2, Wallet, Banknote, Trash2, Pencil } from "lucide-react";

const TYPES = [
  { value: "bank", label: "Bank account", icon: Building2 },
  { value: "wallet", label: "Wallet (UPI/PayPal)", icon: Wallet },
  { value: "cash", label: "Cash", icon: Banknote },
];

export default function Accounts() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const canEdit = user?.role === "owner" || user?.role === "editor";

  const load = useCallback(async () => {
    const res = await api.get("/accounts");
    setAccounts(res.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this account?")) return;
    await api.delete(`/accounts/${id}`);
    toast.success("Account deleted");
    load();
  };

  return (
    <div className="p-10" data-testid="accounts-page">
      <PageHeader
        subtitle="Money sources"
        title="Accounts & Wallets"
        action={canEdit && <button data-testid="add-account-btn" onClick={() => { setEditing(null); setOpen(true); }} className="btn-primary">+ Add account</button>}
      />

      {accounts.length === 0 ? (
        <div className="card-flat p-16 text-center" data-testid="accounts-empty">
          <div className="label-caps mb-3">Empty</div>
          <h3 className="font-heading text-2xl font-bold mb-2">No accounts yet</h3>
          <p className="text-[var(--text-secondary)] mb-6 text-sm">Add a bank account, wallet, or cash holding to start tracking.</p>
          {canEdit && <button onClick={() => { setEditing(null); setOpen(true); }} className="btn-primary">+ Add your first account</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts.map((a) => {
            const TypeIcon = TYPES.find((t) => t.value === a.type)?.icon || Wallet;
            return (
              <div key={a.id} className="card-flat p-6" data-testid={`account-card-${a.id}`}>
                <div className="flex items-start justify-between mb-6">
                  <div className="w-10 h-10 bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center">
                    <TypeIcon strokeWidth={1.5} className="w-5 h-5" />
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(a); setOpen(true); }} data-testid={`edit-account-${a.id}`} className="p-2 hover:bg-[var(--bg)]"><Pencil className="w-4 h-4" strokeWidth={1.5} /></button>
                      <button onClick={() => handleDelete(a.id)} data-testid={`delete-account-${a.id}`} className="p-2 hover:bg-[var(--bg)]"><Trash2 className="w-4 h-4" strokeWidth={1.5} /></button>
                    </div>
                  )}
                </div>
                <div className="label-caps mb-1">{a.type}</div>
                <h3 className="font-heading text-xl font-bold mb-4">{a.name}</h3>
                <div className="font-mono text-3xl font-medium tracking-tight">{formatMoney(a.current_balance, a.currency)}</div>
                <div className="text-xs text-[var(--text-secondary)] mt-1 font-mono">Opening: {formatMoney(a.opening_balance, a.currency)}</div>
              </div>
            );
          })}
        </div>
      )}

      {open && <AccountModal initial={editing} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function AccountModal({ initial, onClose, onSaved }) {
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState(initial?.type || "bank");
  const [currency, setCurrency] = useState(initial?.currency || "INR");
  const [opening, setOpening] = useState(initial?.opening_balance ?? 0);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name, type, currency, opening_balance: parseFloat(opening) || 0 };
      if (initial) await api.put(`/accounts/${initial.id}`, payload);
      else await api.post("/accounts", payload);
      toast.success(initial ? "Account updated" : "Account created");
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#1C1C1A]/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card-flat p-8 w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="account-modal">
        <div className="label-caps mb-2">{initial ? "Edit" : "New"}</div>
        <h2 className="font-heading text-3xl font-black tracking-tighter mb-6">{initial ? "Edit account" : "Add account"}</h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label-caps block mb-2">Name</label>
            <input data-testid="account-name-input" required value={name} onChange={(e) => setName(e.target.value)} className="input-flat" placeholder="e.g. HDFC Savings" />
          </div>
          <div>
            <label className="label-caps block mb-2">Type</label>
            <select data-testid="account-type-select" value={type} onChange={(e) => setType(e.target.value)} className="input-flat">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-caps block mb-2">Currency</label>
              <select data-testid="account-currency-select" value={currency} onChange={(e) => setCurrency(e.target.value)} className="input-flat">
                {["INR", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "SGD"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label-caps block mb-2">Opening balance</label>
              <input data-testid="account-opening-input" type="number" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} className="input-flat font-mono" />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} data-testid="account-save-btn" className="btn-primary flex-1 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
