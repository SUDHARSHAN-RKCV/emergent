import React, { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Upload, Download } from "lucide-react";

// Simple CSV parser (handles quoted fields)
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const parseLine = (line) => {
    const result = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { result.push(cur); cur = ""; }
      else cur += ch;
    }
    result.push(cur);
    return result.map((s) => s.trim());
  };
  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
    return obj;
  });
}

export default function CSVImportModal({ accounts, onClose, onImported }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => setCsvText(ev.target.result);
    r.readAsText(f);
  };

  const downloadTemplate = () => {
    const csv = "date,name,type,unit_price,quantity,billed_amount,category_name,is_recurrent,recurrence_period,notes\n2026-01-15,Milk 1L,expense,60,2,120,Groceries,false,,\n2026-01-15,Salary,income,,,75000,Salary,true,monthly,Jan payroll\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "ledger_import_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async () => {
    if (!accountId || !csvText.trim()) return;
    setImporting(true);
    try {
      const rows = parseCSV(csvText);
      if (rows.length === 0) { toast.error("No rows found"); setImporting(false); return; }
      const res = await api.post("/transactions/import", { account_id: accountId, rows });
      setResult(res.data);
      toast.success(`Imported ${res.data.inserted} of ${res.data.total} rows`);
      if (res.data.inserted > 0) onImported?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#1C1C1A]/40 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="card-flat p-8 w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()} data-testid="csv-import-modal">
        <div className="label-caps mb-2">Bulk</div>
        <h2 className="font-heading text-3xl font-black tracking-tighter mb-6">Import transactions (CSV)</h2>

        <div className="space-y-4">
          <div>
            <label className="label-caps block mb-2">Target account *</label>
            <select data-testid="csv-account-select" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input-flat">
              <option value="">— Select —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label-caps">CSV file or paste</label>
              <button onClick={downloadTemplate} data-testid="csv-template-btn" className="text-xs underline underline-offset-4 flex items-center gap-1">
                <Download className="w-3 h-3" /> Download template
              </button>
            </div>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} data-testid="csv-file-input" className="input-flat mb-2" />
            <textarea
              data-testid="csv-text-area"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="input-flat font-mono text-xs"
              rows={8}
              placeholder="date,name,type,unit_price,quantity,billed_amount,category_name,is_recurrent,recurrence_period,notes"
            />
            <div className="text-xs text-[var(--text-secondary)] mt-2">
              Headers (case-insensitive): <code className="font-mono">date, name, type</code> (expense/income), <code className="font-mono">unit_price, quantity, billed_amount, category_name, is_recurrent, recurrence_period, notes</code>
            </div>
          </div>

          {result && (
            <div className="card-flat p-4 bg-[var(--bg)]" data-testid="csv-result">
              <div className="font-mono text-sm">
                Inserted: <span className="text-[var(--income)] font-semibold">{result.inserted}</span> / {result.total}
              </div>
              {result.errors?.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-[var(--expense)] cursor-pointer">{result.errors.length} error(s)</summary>
                  <pre className="text-xs mt-2 max-h-40 overflow-auto">{JSON.stringify(result.errors, null, 2)}</pre>
                </details>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Close</button>
            <button onClick={doImport} disabled={importing || !accountId || !csvText.trim()} data-testid="csv-import-btn" className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2">
              <Upload className="w-4 h-4" strokeWidth={1.5} /> {importing ? "Importing…" : "Import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
