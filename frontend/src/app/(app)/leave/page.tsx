"use client";

import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { SearchInput } from "@/components/Fields";
import { LeavePanel } from "@/components/LeavePanel";
import { PageHeader } from "@/components/PageHeader";
import { Pill } from "@/components/Pill";
import { BlockSkeleton } from "@/components/Skeleton";
import { Table } from "@/components/Table";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

/** Every employee with days taken and days left. Choosing a person shows all their requests below. */
export default function StaffAndLeave() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const staff = useAsync(() => api.leave.staff(), []);
  const detail = useAsync(() => (selected ? api.leave.forEmployee(selected) : Promise.resolve(null)), [selected]);

  const rows = (staff.data ?? []).filter((s) => !q || `${s.fullName} ${s.jobTitle}`.toLowerCase().includes(q.toLowerCase()));
  const person = staff.data?.find((s) => s.employeeId === selected);
  const reload = () => {
    staff.reload();
    detail.reload();
  };

  return (
    <>
      <PageHeader title="Staff & Leave" subtitle="Every employee with annual leave taken and days left. Choose a person to see all their requests." />
      <SearchInput value={q} onChange={setQ} placeholder="Search by name or position" label="Search staff" />
      {staff.error ? (
        <ErrorState error={staff.error} onRetry={staff.reload} />
      ) : (
        <Table
          caption="Staff and leave balances"
          loading={staff.loading && !staff.data}
          rows={rows}
          rowKey={(s) => s.employeeId}
          onRowClick={(s) => setSelected(s.employeeId)}
          isSelected={(s) => s.employeeId === selected}
          empty={<EmptyState title="No staff found" />}
          columns={[
            { key: "name", header: "Employee", render: (s) => <span className="font-semibold text-navy">{s.fullName}</span> },
            { key: "pos", header: "Position", hideOnMobile: true, render: (s) => s.jobTitle },
            { key: "mgr", header: "Line manager", hideOnMobile: true, render: (s) => s.managerName || "None (HR decides)" },
            { key: "taken", header: "Days taken", render: (s) => s.takenDays },
            { key: "left", header: "Days left", render: (s) => <strong className="text-ink">{s.remainingDays}</strong> },
            { key: "pend", header: "Pending", hideOnMobile: true, render: (s) => (s.pendingDays > 0 ? s.pendingDays : "") },
            { key: "out", header: "", render: (s) => (s.outNow ? <Pill tone="info">Out now{s.outNowReason ? `: ${s.outNowReason}` : ""}</Pill> : null) },
          ]}
        />
      )}
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
