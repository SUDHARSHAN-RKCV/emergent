import React from "react";
import Sidebar from "@/components/Sidebar";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedLayout({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading">
        <div className="font-mono text-sm text-[var(--text-secondary)]">LOADING…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  // MFA gate
  if (user.mfa_enabled && !user.mfa_verified) {
    return <Navigate to="/mfa-verify" replace />;
  }

  return (
    <div className="flex bg-[var(--bg)] min-h-screen">
      <Sidebar />
      <main className="flex-1 max-w-[calc(100%-16rem)]">{children}</main>
    </div>
  );
}
