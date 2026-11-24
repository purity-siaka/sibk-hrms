import type { Role, User } from "./types";

export const isHR = (u?: User | null): boolean => !!u && (u.role === "hr_admin" || u.role === "hr_officer");
export const isAdmin = (u?: User | null): boolean => !!u && u.role === "hr_admin";
export const isManager = (u?: User | null): boolean => !!u && u.role === "manager";
export const isStaffRole = (r: Role): boolean => r !== "employee";

export function homeFor(u: User): string {
  if (u.role === "employee") return "/me";
  if (isHR(u)) return "/dashboard";
  return "/employees";
}
