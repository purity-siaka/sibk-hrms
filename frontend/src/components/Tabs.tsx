"use client";

import type { KeyboardEvent } from "react";

export interface TabItem {
  key: string;
  label: string;
  badge?: number | string;
}

export function Tabs({ items, active, onChange, label }: { items: TabItem[]; active: string; onChange: (k: string) => void; label: string }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const idx = items.findIndex((i) => i.key === active);
    const next = items[(idx + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
    onChange(next.key);
    e.preventDefault();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={on}
            aria-controls={`panel-${t.key}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={`-mb-px min-h-[44px] whitespace-nowrap border-b-[3px] px-4 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
              on ? "border-gold font-semibold text-navy" : "border-transparent text-muted hover:text-navy"
            }`}
          >
            {t.label}
            {t.badge !== undefined && t.badge !== 0 && (
              <span className="ml-2 rounded-full bg-gold px-2 py-px text-xs font-bold text-navy-dark">{t.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
