"use client";

import { LogOut, Menu } from "lucide-react";
import type { User } from "@/lib/types";
import { humanize, initials } from "@/lib/format";
import { IconButton } from "./Button";

export function Topbar({ title, user, onMenu, onLogout }: { title: string; user: User; onMenu: () => void; onLogout: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3 sm:px-6">
      <IconButton label="Open menu" onClick={onMenu} className="lg:hidden" aria-controls="mobile-nav">
        <Menu className="h-5 w-5" />
      </IconButton>
      <p className="min-w-0 flex-1 truncate text-lg font-bold text-ink">{title}</p>
      <div className="flex items-center gap-3 rounded-full bg-bg py-1 pl-1 pr-3">
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
          {initials(user.name)}
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-[13px] font-semibold text-ink">{user.name}</span>
          <span className="block text-xs text-muted">{humanize(user.role)}</span>
        </span>
      </div>
      <button
        onClick={onLogout}
        className="flex min-h-[40px] items-center gap-2 rounded-[10px] px-3 text-sm font-semibold text-navy hover:bg-[#EEF1FB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Sign out</span>
        <span className="sr-only sm:hidden">Sign out</span>
      </button>
    </header>
  );
}
