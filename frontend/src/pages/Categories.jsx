import React, { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

const COLORS = ["#2C3E2D", "#9B3922", "#C28A2B", "#2D5A27", "#1C1C1A", "#6E6D68", "#5A4B8B", "#2A5B7A"];

export default function Categories() {
  const { user } = useAuth();
  const [cats, setCats] = useState([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("expense");
  const [color, setColor] = useState(COLORS[0]);
  const canEdit = user?.role === "owner" || user?.role === "editor";

  const load = useCallback(async () => {
    const res = await api.get("/categories");
    setCats(res.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post("/categories", { name: name.trim(), kind, color });
      toast.success("Category added");
      setName("");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this category?")) return;
    await api.delete(`/categories/${id}`);
    load();
  };

  const expenseCats = cats.filter((c) => c.kind === "expense");
  const incomeCats = cats.filter((c) => c.kind === "income");

  return (
    <div className="p-10" data-testid="categories-page">
      <PageHeader subtitle="Organize spending" title="Categories" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {canEdit && (
          <div className="card-flat p-6" data-testid="add-category-form">
            <div className="label-caps mb-1">New</div>
            <h3 className="font-heading text-xl font-bold mb-6">Add category</h3>
            <form onSubmit={add} className="space-y-4">
              <div>
                <label className="label-caps block mb-2">Name</label>
                <input data-testid="cat-name-input" required value={name} onChange={(e) => setName(e.target.value)} className="input-flat" placeholder="e.g. Subscriptions" />
              </div>
              <div>
                <label className="label-caps block mb-2">Kind</label>
                <select data-testid="cat-kind-select" value={kind} onChange={(e) => setKind(e.target.value)} className="input-flat">
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
              <div>
                <label className="label-caps block mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c} type="button" onClick={() => setColor(c)}
                      data-testid={`color-${c}`}
                      style={{ background: c }}
                      className={`w-8 h-8 ${color === c ? "ring-2 ring-offset-2 ring-[var(--text)]" : ""}`}
                    />
                  ))}
                </div>
              </div>
              <button type="submit" data-testid="cat-add-btn" className="btn-primary w-full">Add category</button>
            </form>
          </div>
        )}

        <div className={canEdit ? "lg:col-span-2 space-y-6" : "lg:col-span-3 space-y-6"}>
          <CatGroup title="Expense categories" cats={expenseCats} canEdit={canEdit} onDel={del} />
          <CatGroup title="Income categories" cats={incomeCats} canEdit={canEdit} onDel={del} />
        </div>
      </div>
    </div>
  );
}

function CatGroup({ title, cats, canEdit, onDel }) {
  return (
    <div className="card-flat p-6">
      <div className="label-caps mb-1">{title}</div>
      <h3 className="font-heading text-xl font-bold mb-4">{cats.length} categories</h3>
      {cats.length === 0 ? (
        <div className="text-sm text-[var(--text-secondary)] py-4">None yet.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <div key={c.id} className="flex items-center gap-2 border border-[var(--border)] px-3 py-1.5 bg-[var(--bg)]" data-testid={`cat-${c.id}`}>
              <span className="w-3 h-3" style={{ background: c.color }} />
              <span className="text-sm font-medium">{c.name}</span>
              {canEdit && (
                <button onClick={() => onDel(c.id)} data-testid={`delete-cat-${c.id}`} className="text-[var(--text-secondary)] hover:text-[var(--expense)]">
                  <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
