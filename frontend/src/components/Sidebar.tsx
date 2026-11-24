"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import type { NavModule } from "@/lib/nav";
import { activeModule } from "@/lib/nav";
import { BrandTitle } from "./Brand";
import { IconButton } from "./Button";

interface Props {
  modules: NavModule[];
  open: boolean;
  onClose: () => void;
  badges?: Record<string, number>;
}

function NavList({ modules, badges, onNavigate }: { modules: NavModule[]; badges?: Record<string, number>; onNavigate: () => void }) {
  const path = usePathname();
  const active = activeModule(modules, path);
  return (
    <nav aria-label="Main modules" className="flex flex-col gap-1">
      {modules.map((m) => {
        const on = active?.key === m.key;
        const Icon = m.icon;
        const badge = badges?.[m.key];
        return (
          <Link
            key={m.key}
            href={m.href}
            onClick={onNavigate}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-[44px] items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
              on ? "bg-white font-semibold text-navy" : "text-[#DCE3FA] hover:bg-white/10"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            <span>{m.label}</span>
            {badge ? <span className="ml-auto rounded-full bg-gold px-2 py-px text-xs font-bold text-navy-dark">{badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ modules, open, onClose, badges }: Props) {
  return (
    <>
      {/* desktop */}
      <aside className="hidden w-[252px] shrink-0 flex-col gap-6 bg-navy px-3.5 py-5 lg:flex">
        <div className="px-1">
          <BrandTitle />
        </div>
        <NavList modules={modules} badges={badges} onNavigate={() => undefined} />
        <p className="mt-auto px-2 text-xs text-[#AEB9E3]">Salaam Investment Bank Kenya</p>
      </aside>
      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/60" onClick={onClose} aria-hidden />
          <aside id="mobile-nav" className="relative flex h-full w-[272px] max-w-[85vw] flex-col gap-6 bg-navy px-3.5 py-5 shadow-lift">
            <div className="flex items-start justify-between px-1">
              <BrandTitle />
              <IconButton label="Close menu" onClick={onClose} className="!text-white hover:!bg-white/10">
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            <NavList modules={modules} badges={badges} onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
