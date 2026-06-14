import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useEffect } from "react";

export default function Login() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      if (user.mfa_enabled && !user.mfa_verified) navigate("/mfa-verify", { replace: true });
      else navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  const handleGoogleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/auth/callback";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg)]">
      {/* Left panel - hero */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden border-r border-[var(--border)]">
        <img
          src="https://images.unsplash.com/photo-1504548840739-580b10ae7715?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTJ8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwb3JnYW5pYyUyMHRleHR1cmV8ZW58MHx8fHwxNzgxMTM0MTIwfDA&ixlib=rb-4.1.0&q=85"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[var(--bg)]/30" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="font-heading text-3xl font-black tracking-tighter text-[var(--text)]">
            LEDGER<span className="text-[var(--primary)]">.</span>
          </div>
          <div>
            <div className="label-caps mb-3 text-[var(--text)]">Money, mapped.</div>
            <h2 className="font-heading text-5xl font-black tracking-tighter leading-[0.9] max-w-md text-[var(--text)]">
              Track every rupee across accounts, wallets &amp; cash.
            </h2>
            <p className="mt-6 max-w-md text-[var(--text)] text-base leading-relaxed">
              Sharp visibility into spending trends, unit-price drift, and recurring expenses — all in one place.
            </p>
          </div>
          <div className="font-mono text-xs text-[var(--text)] opacity-70">SECURE · GOOGLE OAUTH · TOTP MFA</div>
        </div>
      </div>

      {/* Right panel - sign in */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="label-caps mb-3">Welcome back</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter leading-none mb-3">Sign in</h1>
          <p className="text-[var(--text-secondary)] mb-10 text-sm leading-relaxed">
            Use your Google account. If you have MFA enabled, you'll be prompted for your authenticator code next.
          </p>

          <button
            onClick={handleGoogleLogin}
            data-testid="google-login-btn"
            className="w-full btn-primary flex items-center justify-center gap-3 py-3.5 text-base"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity="0.85"/>
              <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity="0.7"/>
              <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity="0.55"/>
            </svg>
            Continue with Google
          </button>

          <div className="mt-10 pt-6 border-t border-[var(--border)]">
            <div className="label-caps mb-3">Security</div>
            <ul className="text-sm text-[var(--text-secondary)] space-y-2 leading-relaxed">
              <li>• Google handles your password &amp; primary 2FA.</li>
              <li>• Optional in-app TOTP (Google Authenticator / Authy).</li>
              <li>• Role-based access: Owner, Editor, Viewer.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
