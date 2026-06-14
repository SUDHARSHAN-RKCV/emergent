import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = window.location.hash;
    const match = hash.match(/session_id=([^&]+)/);
    if (!match) {
      navigate("/login");
      return;
    }
    const sessionId = match[1];
    // Clear hash immediately
    window.history.replaceState(null, "", window.location.pathname);

    (async () => {
      try {
        const res = await api.post("/auth/session", { session_id: sessionId });
        setUser(res.data);
        if (res.data.mfa_enabled && !res.data.mfa_verified) {
          navigate("/mfa-verify", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      } catch (e) {
        console.error("Auth failed:", e);
        navigate("/login", { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="font-mono text-sm text-[var(--text-secondary)]">ESTABLISHING SESSION…</div>
    </div>
  );
}
