import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Wallet, ArrowRightLeft, FolderTree, LineChart, Settings, LogOut, Target } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/accounts", label: "Accounts", icon: Wallet, testid: "nav-accounts" },
  { to: "/transactions", label: "Transactions", icon: ArrowRightLeft, testid: "nav-transactions" },
  { to: "/categories", label: "Categories", icon: FolderTree, testid: "nav-categories" },
  { to: "/budgets", label: "Budgets", icon: Target, testid: "nav-budgets" },
  { to: "/analytics", label: "Analytics", icon: LineChart, testid: "nav-analytics" },
  { to: "/settings", label: "Settings", icon: Settings, testid: "nav-settings" },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside className="w-64 border-r border-[var(--border)] bg-[var(--bg)] h-screen sticky top-0 flex flex-col" data-testid="sidebar">
      <div className="px-6 py-8 border-b border-[var(--border)]">
        <div className="font-heading text-2xl font-black tracking-tighter">LEDGER<span className="text-[var(--primary)]">.</span></div>
        <div className="label-caps mt-1">Personal Finance OS</div>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1">
        {navItems.map(({ to, label, icon: Icon, testid }) => {
          const active = location.pathname === to || (to !== "/dashboard" && location.pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              data-testid={testid}
              className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                active
                  ? "bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] font-semibold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--surface)]/60 border border-transparent"
              }`}
            >
              <Icon strokeWidth={1.5} className="w-4 h-4" />
              <span className="text-sm">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] p-4">
        <div className="flex items-center gap-3 mb-3">
          {user?.picture ? (
            <img src={user.picture} alt="" className="w-9 h-9 object-cover" data-testid="user-avatar" />
          ) : (
            <div className="w-9 h-9 bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center font-mono text-sm">
              {user?.name?.[0]?.toUpperCase() || "U"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate" data-testid="user-name">{user?.name}</div>
            <div className="label-caps" data-testid="user-role">{user?.role}</div>
          </div>
        </div>
        <button onClick={handleLogout} data-testid="logout-btn" className="w-full btn-secondary flex items-center justify-center gap-2 text-sm">
          <LogOut className="w-4 h-4" strokeWidth={1.5} /> Sign out
        </button>
      </div>
    </aside>
  );
}
