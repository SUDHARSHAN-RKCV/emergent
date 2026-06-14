import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function MFAVerify() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { checkAuth, logout } = useAuth();

  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    try {
      await api.post("/mfa/verify", { code });
      await checkAuth();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error("Invalid code. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-6">
      <div className="card-flat p-10 w-full max-w-md" data-testid="mfa-verify-card">
        <div className="label-caps mb-3">Two-Factor Authentication</div>
        <h1 className="font-heading text-3xl font-black tracking-tighter mb-3">Enter your code</h1>
        <p className="text-[var(--text-secondary)] text-sm mb-8 leading-relaxed">
          Open your authenticator app (Google Authenticator, Authy, 1Password) and enter the 6-digit code for Ledger.
        </p>

        <form onSubmit={handleVerify}>
          <input
            data-testid="mfa-code-input"
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="input-flat font-mono text-3xl text-center tracking-[0.5em] py-4"
            placeholder="000000"
          />
          <button
            type="submit"
            data-testid="mfa-verify-submit"
            disabled={loading || code.length !== 6}
            className="btn-primary w-full mt-6 disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify & continue"}
          </button>
        </form>

        <button onClick={handleCancel} data-testid="mfa-cancel" className="w-full mt-3 text-sm text-[var(--text-secondary)] hover:text-[var(--text)] py-2">
          Cancel &amp; sign out
        </button>
      </div>
    </div>
  );
}
