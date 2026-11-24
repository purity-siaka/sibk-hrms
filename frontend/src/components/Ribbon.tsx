"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ribbonActive, type RibbonItem } from "@/lib/nav";

export function Ribbon({ items, label }: { items: RibbonItem[]; label: string }) {
  const path = usePathname();
  if (items.length === 0) return null;
  const active = ribbonActive(items, path);
  return (
    <nav aria-label={`${label} sections`} className="flex gap-1 overflow-x-auto border-b border-line bg-white px-3 sm:px-6">
      {items.map((it) => {
        const on = it.href === active;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-[44px] items-center whitespace-nowrap border-b-[3px] px-3.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
              on ? "border-gold font-semibold text-navy" : "border-transparent text-muted hover:text-navy"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
