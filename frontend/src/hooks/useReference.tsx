"use client";

import { createContext, useContext, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Department, Reference } from "@/lib/types";
import { useAsync } from "./useAsync";

const FALLBACK: Reference = {
  documentTypes: [],
  employmentTypes: ["permanent", "fixed_term", "temporary", "intern"],
  employeeStatuses: ["probation", "active", "on_notice", "exited"],
  applicantStages: ["applied", "screening", "interview", "assessment", "offer", "hired", "rejected"],
  ownerRoles: ["hr", "it", "finance", "line_manager"],
  leaveTypes: [
    { key: "annual", label: "Annual" },
    { key: "sick", label: "Sick" },
    { key: "study", label: "Study" },
    { key: "maternity", label: "Maternity" },
    { key: "paternity", label: "Paternity" },
    { key: "compassionate", label: "Compassionate" },
    { key: "unpaid", label: "Unpaid" },
  ],
};

const RefContext = createContext<Reference>(FALLBACK);

export function ReferenceProvider({ children }: { children: ReactNode }) {
  const { data } = useAsync(() => api.reference(), []);
  return <RefContext.Provider value={data ?? FALLBACK}>{children}</RefContext.Provider>;
}

export function useReference(): Reference {
  return useContext(RefContext);
}

/** Departments for selects. Silent on failure (e.g. role without access). */
export function useDepartments(): Department[] {
  const { data } = useAsync(() => api.departments.list().catch(() => [] as Department[]), []);
  return data ?? [];
}
