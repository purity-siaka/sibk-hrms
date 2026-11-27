import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  FileCheck2,
  FileSignature,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  Settings2,
  UserCircle2,
  Users,
} from "lucide-react";
import type { User } from "./types";
import { isAdmin, isHR } from "./access";

export interface RibbonItem {
  label: string;
  href: string;
  /** paths that also count as active for this item */
  match?: string[];
  roles?: ("hr" | "manager" | "admin")[];
}

export interface NavModule {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  /** path prefixes owned by this module */
  prefixes: string[];
  ribbon: RibbonItem[];
  roles: ("hr" | "manager" | "admin" | "employee")[];
}

const MODULES: NavModule[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", prefixes: ["/dashboard"], ribbon: [], roles: ["hr"] },
  {
    key: "employees",
    label: "Employees",
    icon: Users,
    href: "/employees",
    prefixes: ["/employees", "/departments", "/change-requests", "/reports"],
    roles: ["hr", "manager"],
    ribbon: [
      { label: "Employees", href: "/employees" },
      { label: "Departments", href: "/departments", roles: ["hr"] },
      { label: "Change Requests", href: "/change-requests", roles: ["hr"] },
      { label: "Reports", href: "/reports", roles: ["hr"] },
    ],
  },
  {
    key: "leave",
    label: "Leave",
    icon: CalendarDays,
    href: "/leave",
    prefixes: ["/leave"],
    roles: ["hr"],
    ribbon: [
      { label: "Staff & Leave", href: "/leave" },
      { label: "Approvals", href: "/leave/approvals" },
      { label: "HR Reports", href: "/leave/reports" },
      { label: "All requests", href: "/leave/requests" },
      { label: "Holidays", href: "/leave/holidays" },
      { label: "Year-end", href: "/leave/year-end", roles: ["admin"] },
    ],
  },
  {
    key: "recruitment",
    label: "Recruitment",
    icon: BriefcaseBusiness,
    href: "/recruitment",
    prefixes: ["/recruitment"],
    roles: ["hr"],
    ribbon: [
      { label: "Applications", href: "/recruitment" },
      { label: "Job positions", href: "/recruitment/jobs" },
    ],
  },
  {
    key: "documents",
    label: "Documents",
    icon: FileCheck2,
    href: "/documents",
    prefixes: ["/documents"],
    roles: ["hr"],
    ribbon: [
      { label: "Awaiting review", href: "/documents" },
      { label: "All documents", href: "/documents/all" },
      { label: "Expiring", href: "/documents/expiring" },
    ],
  },
  {
    key: "signoffs",
    label: "Document Sign-offs",
    icon: FileSignature,
    href: "/signoffs",
    prefixes: ["/signoffs"],
    roles: ["hr", "manager"],
    ribbon: [],
  },
  {
    key: "training",
    label: "Training",
    icon: GraduationCap,
    href: "/training",
    prefixes: ["/training"],
    roles: ["hr", "manager"],
    ribbon: [],
  },
  {
    key: "tasks",
    label: "Onboarding",
    icon: ClipboardCheck,
    href: "/tasks",
    prefixes: ["/tasks"],
    roles: ["hr", "manager"],
    ribbon: [
      { label: "Onboarding", href: "/tasks" },
      { label: "Offboarding", href: "/tasks/offboarding" },
    ],
  },
  {
    key: "communications",
    label: "Communications",
    icon: Megaphone,
    href: "/announcements",
    prefixes: ["/announcements", "/policies"],
    roles: ["hr", "manager"],
    ribbon: [
      { label: "Announcements", href: "/announcements" },
      { label: "Policies", href: "/policies" },
    ],
  },
  {
    key: "admin",
    label: "Administration",
    icon: Settings2,
    href: "/admin/users",
    prefixes: ["/admin"],
    roles: ["admin"],
    ribbon: [
      { label: "Users", href: "/admin/users" },
      { label: "Audit log", href: "/admin/audit" },
    ],
  },
];

export const PORTAL_RIBBON: RibbonItem[] = [
  { label: "Home", href: "/me" },
  { label: "My profile", href: "/me/profile" },
  { label: "My leave", href: "/me/leave" },
  { label: "My training", href: "/me/training" },
  { label: "My documents", href: "/me/documents" },
  { label: "Document Sign-offs", href: "/signoffs" },
  { label: "Policies", href: "/me/policies" },
];

const portalModule = (key: string, label: string, icon: LucideIcon, href: string): NavModule => ({
  key,
  label,
  icon,
  href,
  prefixes: [href],
  ribbon: [],
  roles: ["employee"],
});

const EMPLOYEE_NAV: NavModule[] = [
  portalModule("me-home", "Home", LayoutDashboard, "/me"),
  portalModule("me-profile", "My profile", UserCircle2, "/me/profile"),
  portalModule("me-leave", "My leave", CalendarDays, "/me/leave"),
  portalModule("me-training", "My training", GraduationCap, "/me/training"),
  portalModule("me-signoffs", "Document Sign-offs", FileSignature, "/signoffs"),
  portalModule("me-docs", "My documents", FileCheck2, "/me/documents"),
  portalModule("me-pol", "Policies", FileText, "/me/policies"),
];

function audienceOf(u: User): ("hr" | "manager" | "admin" | "employee")[] {
  const a: ("hr" | "manager" | "admin" | "employee")[] = [];
  if (isHR(u)) a.push("hr");
  if (u.role === "manager") a.push("manager");
  if (isAdmin(u)) a.push("admin");
  if (u.role === "employee") a.push("employee");
  return a;
}

function ribbonAllowed(item: RibbonItem, u: User): boolean {
  if (!item.roles) return true;
  const aud = audienceOf(u);
  return item.roles.some((r) => aud.includes(r));
}

/** Sidebar modules for this user. Employees get the portal nav. */
export function modulesFor(u: User): NavModule[] {
  if (u.role === "employee") return EMPLOYEE_NAV;
  const aud = audienceOf(u);
  const mods = MODULES.filter((m) => m.roles.some((r) => aud.includes(r))).map((m) => ({
    ...m,
    ribbon: m.ribbon.filter((r) => ribbonAllowed(r, u)),
  }));
  if (u.employeeId) {
    mods.push({
      key: "portal",
      label: "My portal",
      icon: UserCircle2,
      href: "/me",
      prefixes: ["/me"],
      ribbon: PORTAL_RIBBON,
      roles: ["hr", "manager"],
    });
  }
  return mods;
}

export function activeModule(modules: NavModule[], path: string): NavModule | undefined {
  return modules.find((m) => m.prefixes.some((p) => path === p || path.startsWith(`${p}/`)));
}

export function ribbonActive(items: RibbonItem[], path: string): string | undefined {
  // longest matching href wins
  let best: RibbonItem | undefined;
  for (const it of items) {
    if (path === it.href || path.startsWith(`${it.href}/`)) {
      if (!best || it.href.length > best.href.length) best = it;
    }
  }
  return best?.href;
}

