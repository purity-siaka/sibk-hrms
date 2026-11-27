"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { homeFor } from "@/lib/access";
import { activeModule, modulesFor, ribbonActive } from "@/lib/nav";
import { Ribbon } from "./Ribbon";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BlockSkeleton } from "./Skeleton";

/** Employees may only use /me/*; staff may use everything else. */
function allowed(role: string, path: string): boolean {
  if (role === "employee") return path === "/me" || path.startsWith("/me/") || path === "/signoffs";
  if (path.startsWith("/admin")) return role === "hr_admin";
  if (role === "manager") {
    return ["/employees", "/tasks", "/training", "/signoffs", "/announcements", "/policies", "/me"].some((p) => path === p || path.startsWith(`${p}/`));
  }
  return true;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.mustChangePassword) router.replace("/change-password");
    else if (!allowed(user.role, path)) router.replace(homeFor(user));
  }, [loading, user, path, router]);

  useEffect(() => setOpen(false), [path]);

  const [awaiting, setAwaiting] = useState(0);
  const loadAwaiting = useCallback(() => {
    if (user?.employeeId) api.signoffs.summary().then((s) => setAwaiting(s.awaiting)).catch(() => undefined);
  }, [user?.employeeId]);
  useEffect(() => {
    loadAwaiting();
    const t = setInterval(loadAwaiting, 60_000);
    return () => clearInterval(t);
  }, [loadAwaiting, path]);

  const modules = useMemo(() => (user ? modulesFor(user) : []), [user]);

  if (loading || !user || user.mustChangePassword || !allowed(user.role, path)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-8">
        <div className="w-64">
          <BlockSkeleton lines={3} />
        </div>
      </div>
    );
  }

  const mod = activeModule(modules, path);
  const items = mod?.ribbon ?? [];
  const current = items.find((i) => i.href === ribbonActive(items, path));
  const title = current && mod && mod.ribbon.length > 1 ? `${mod.label}: ${current.label}` : mod?.label ?? "SIBK Management System";

  return (
    <div className="flex min-h-screen bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[70] focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-navy-dark">
        Skip to content
      </a>
      <Sidebar badges={{ signoffs: awaiting, "me-signoffs": awaiting }} modules={modules} open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} user={user} onMenu={() => setOpen(true)} onLogout={logout} onUnread={loadAwaiting} />
        <Ribbon items={items} label={mod?.label ?? "Page"} />
        <main id="main" className="flex flex-1 flex-col gap-5 p-4 pb-12 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
