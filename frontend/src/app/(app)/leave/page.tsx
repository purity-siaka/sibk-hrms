"use client";

import { useState } from "react";
import { ErrorState } from "@/components/EmptyState";
import { LeavePanel } from "@/components/LeavePanel";
import { StaffLeaveTable } from "@/components/StaffLeaveTable";
import { PageHeader } from "@/components/PageHeader";
import { BlockSkeleton } from "@/components/Skeleton";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

/** Every employee with days taken and days left. Choosing a person shows all their requests below. */
export default function StaffAndLeave() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<number | null>(null);
  const staff = useAsync(() => api.leave.staff(), []);
  const detail = useAsync(() => (selected ? api.leave.forEmployee(selected) : Promise.resolve(null)), [selected]);

  const person = staff.data?.find((s) => s.employeeId === selected);
  const reload = () => {
    staff.reload();
    detail.reload();
  };

  return (
    <>
      <PageHeader title="Staff & Leave" subtitle="Every employee with all their leave figures. Choose a person to see all their requests." />
      <StaffLeaveTable staff={staff} selected={selected} onSelect={setSelected} />
      {selected && (
        <section aria-label={`Requests of ${person?.fullName ?? "employee"}`} className="space-y-4 pt-2">
          <h2 className="text-lg font-bold text-ink">{person?.fullName}: all requests</h2>
          {detail.error ? (
            <ErrorState error={detail.error} onRetry={detail.reload} />
          ) : detail.loading && !detail.data ? (
            <BlockSkeleton lines={5} />
          ) : (
            detail.data && <LeavePanel summary={detail.data} onChange={reload} canApply employeeId={person && person.employeeId !== user?.employeeId ? person.employeeId : undefined} employeeName={person?.fullName} />
          )}
        </section>
      )}
    </>
  );
}
