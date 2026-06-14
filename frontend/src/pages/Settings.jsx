import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff } from "lucide-react";

export default function Settings() {
  const { user, checkAuth } = useAuth();
  const [users, setUsers] = useState([]);
  const [currency, setCurrency] = useState(user?.preferred_currency || "INR");
  const [waNumber, setWaNumber] = useState(user?.whatsapp_number || "");
  const [waEnabled, setWaEnabled] = useState(user?.whatsapp_enabled || false);

  // MFA state
  const [mfaSetup, setMfaSetup] = useState(null); // { qr_code_data_uri, secret }
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.role === "owner") {
      api.get("/users").then((r) => setUsers(r.data));
    }
  }, [user]);

  const startMFA = async () => {
    setBusy(true);
    try {
      const res = await api.post("/mfa/setup");
      setMfaSetup(res.data);
    } catch (e) {
      toast.error("Failed to start MFA setup");
    } finally { setBusy(false); }
  };

  const enableMFA = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await api.post("/mfa/enable", { code });
      toast.success("MFA enabled");
      setMfaSetup(null); setCode("");
      await checkAuth();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Invalid code");
    } finally { setBusy(false); }
  };

  const disableMFA = async () => {
    const c = window.prompt("Enter current 6-digit code to disable MFA:");
    if (!c) return;
    setBusy(true);
    try {
      await api.post("/mfa/disable", { code: c });
      toast.success("MFA disabled");
      await checkAuth();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Invalid code");
    } finally { setBusy(false); }
  };

  const saveCurrency = async () => {
    await api.put("/me/currency", { currency });
    toast.success("Default currency updated");
    await checkAuth();
  };

  const saveWhatsApp = async () => {
    try {
      await api.put("/me/whatsapp", { whatsapp_number: waNumber, whatsapp_enabled: waEnabled });
      toast.success("WhatsApp reminders updated");
      await checkAuth();
    } catch (e) {
      toast.error("Failed to save");
    }
  };

  const disableUser = async (uid, disabled) => {
    try {
      await api.put(`/users/${uid}/disable`, { disabled });
      toast.success(disabled ? "User disabled" : "User enabled");
      const r = await api.get("/users"); setUsers(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const deleteUserHard = async (uid, email) => {
    if (!window.confirm(`Hard-delete ${email}? This purges ALL their data and CANNOT be undone.`)) return;
    if (!window.confirm("Are you absolutely sure?")) return;
    try {
      await api.delete(`/users/${uid}`);
      toast.success("User deleted");
      const r = await api.get("/users"); setUsers(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const changeRole = async (uid, role) => {
    try {
      await api.put(`/users/${uid}/role`, { role });
      toast.success("Role updated");
      const r = await api.get("/users");
      setUsers(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="p-10" data-testid="settings-page">
      <PageHeader subtitle="Preferences" title="Settings" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Profile */}
        <div className="card-flat p-6" data-testid="profile-card">
          <div className="label-caps mb-1">Profile</div>
          <h3 className="font-heading text-xl font-bold mb-4">You</h3>
          <div className="flex items-center gap-4 mb-4">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-14 h-14 object-cover" />
            ) : (
              <div className="w-14 h-14 bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center font-mono text-xl">{user?.name?.[0]}</div>
            )}
            <div>
              <div className="font-semibold">{user?.name}</div>
              <div className="text-sm text-[var(--text-secondary)]">{user?.email}</div>
              <span className="badge-recurrent mt-1 inline-block">{user?.role}</span>
            </div>
          </div>
        </div>

        {/* Currency */}
        <div className="card-flat p-6" data-testid="currency-card">
          <div className="label-caps mb-1">Preferences</div>
          <h3 className="font-heading text-xl font-bold mb-4">Default currency</h3>
          <select data-testid="currency-select" value={currency} onChange={(e) => setCurrency(e.target.value)} className="input-flat mb-3">
            {["INR", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "SGD"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <button onClick={saveCurrency} data-testid="save-currency-btn" className="btn-primary w-full">Save</button>
          <p className="text-xs text-[var(--text-secondary)] mt-3">Existing accounts keep their own currency; this is just your display default.</p>
        </div>

        {/* MFA */}
        <div className="card-flat p-6" data-testid="mfa-card">
          <div className="label-caps mb-1">Security</div>
          <h3 className="font-heading text-xl font-bold mb-4">Two-factor authentication</h3>
          {user?.mfa_enabled ? (
            <div>
              <div className="flex items-center gap-2 text-[var(--income)] mb-4">
                <ShieldCheck className="w-5 h-5" strokeWidth={1.5} />
                <span className="font-medium text-sm">MFA is enabled</span>
              </div>
              <button onClick={disableMFA} disabled={busy} data-testid="disable-mfa-btn" className="btn-secondary w-full">
                <ShieldOff className="w-4 h-4 inline mr-2" strokeWidth={1.5} /> Disable MFA
              </button>
            </div>
          ) : mfaSetup ? (
            <div>
              <p className="text-sm text-[var(--text-secondary)] mb-3">Scan the QR with Google Authenticator / Authy, then enter the 6-digit code.</p>
              <div className="bg-white p-2 inline-block border border-[var(--border)] mb-3">
                <img src={mfaSetup.qr_code_data_uri} alt="QR" className="w-40 h-40" data-testid="mfa-qr-img" />
              </div>
              <details className="mb-3">
                <summary className="text-xs text-[var(--text-secondary)] cursor-pointer">Can't scan? Show key</summary>
                <code className="font-mono text-xs block mt-2 break-all p-2 bg-[var(--bg)] border border-[var(--border)]" data-testid="mfa-secret">{mfaSetup.secret}</code>
              </details>
              <input
                data-testid="mfa-enable-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                maxLength={6}
                className="input-flat font-mono text-center tracking-[0.4em] mb-3"
                placeholder="000000"
              />
              <button onClick={enableMFA} disabled={busy || code.length !== 6} data-testid="enable-mfa-btn" className="btn-primary w-full disabled:opacity-50">
                {busy ? "Verifying…" : "Enable MFA"}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-[var(--text-secondary)] mb-4">Add an extra layer on top of Google. Required on every sign-in.</p>
              <button onClick={startMFA} disabled={busy} data-testid="start-mfa-btn" className="btn-primary w-full">
                <ShieldCheck className="w-4 h-4 inline mr-2" strokeWidth={1.5} /> Set up MFA
              </button>
            </div>
          )}
        </div>
      </div>

      {/* WhatsApp Reminders */}
      <div className="card-flat p-6 mb-6" data-testid="whatsapp-card">
        <div className="label-caps mb-1">Notifications</div>
        <h3 className="font-heading text-xl font-bold mb-4">WhatsApp reminders</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">Get a WhatsApp message 24 hours before each recurring expense is due. Off by default.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label-caps block mb-2">WhatsApp number (with country code)</label>
            <input data-testid="wa-number-input" value={waNumber} onChange={(e) => setWaNumber(e.target.value)} className="input-flat font-mono" placeholder="+919876543210" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer pb-2">
              <input data-testid="wa-enabled-toggle" type="checkbox" checked={waEnabled} onChange={(e) => setWaEnabled(e.target.checked)} className="w-4 h-4 accent-[var(--primary)]" />
              <span className="text-sm font-medium">Enable 24h-prior reminders</span>
            </label>
          </div>
        </div>
        <button onClick={saveWhatsApp} data-testid="wa-save-btn" className="btn-primary mt-4">Save preferences</button>
      </div>

      {/* RBAC users */}
      {user?.role === "owner" && (
        <div className="card-flat p-6" data-testid="users-card">
          <div className="label-caps mb-1">RBAC · Owner only</div>
          <h3 className="font-heading text-xl font-bold mb-6">Users &amp; roles</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="label-caps text-left py-3">User</th>
                <th className="label-caps text-left py-3">Email</th>
                <th className="label-caps text-left py-3">Role</th>
                <th className="label-caps text-right py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-b border-[var(--border)] last:border-0" data-testid={`user-row-${u.user_id}`}>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      {u.picture ? <img src={u.picture} className="w-8 h-8 object-cover" alt="" /> : <div className="w-8 h-8 bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center font-mono text-xs">{u.name?.[0]}</div>}
                      <span className="text-sm font-medium">{u.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-sm text-[var(--text-secondary)]">{u.email}</td>
                  <td className="py-3"><span className="badge-recurrent">{u.role}</span></td>
                  <td className="py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <select
                        data-testid={`role-select-${u.user_id}`}
                        value={u.role}
                        onChange={(e) => changeRole(u.user_id, e.target.value)}
                        disabled={u.user_id === user.user_id}
                        className="input-flat w-auto py-1.5 text-sm"
                      >
                        <option value="owner">Owner</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={() => disableUser(u.user_id, !u.disabled)}
                        disabled={u.user_id === user.user_id}
                        data-testid={`disable-user-${u.user_id}`}
                        className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-30"
                      >
                        {u.disabled ? "Enable" : "Disable"}
                      </button>
                      <button
                        onClick={() => deleteUserHard(u.user_id, u.email)}
                        disabled={u.user_id === user.user_id}
                        data-testid={`delete-user-${u.user_id}`}
                        className="text-xs px-3 py-1.5 border border-[var(--expense)] text-[var(--expense)] hover:bg-[var(--expense-bg)] disabled:opacity-30"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
