import React from "react";

export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-end justify-between mb-10 pb-6 border-b border-[var(--border)]">
      <div>
        {subtitle && <div className="label-caps mb-2" data-testid="page-subtitle">{subtitle}</div>}
        <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter leading-none text-[var(--text)]" data-testid="page-title">
          {title}
        </h1>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
