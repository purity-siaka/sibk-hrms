"use client";

import { EmptyState, ErrorState } from "./EmptyState";
import { SearchInput } from "./Fields";
import { Pill } from "./Pill";
import { Table } from "./Table";
import type { StaffLeave } from "@/lib/types";
import { useState } from "react";

interface Props {
  staff: { data: StaffLeave[] | null | undefined; loading: boolean; error: unknown; reload: () => void };
  selected?: number | null;
  onSelect?: (id: number) => void;
}

const dash = (n: number) => (n ? n : "–");

/** One row per person with every leave figure. All numbers come from the same requests as All requests and the reports. */
export function StaffLeaveTable({ staff, selected, onSelect }: Props) {
  const [q, setQ] = useState("");
  const next = new Date().getFullYear() + 1;
  const rows = (staff.data ?? []).filter((s) => !q || `${s.fullName} ${s.jobTitle}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <SearchInput value={q} onChange={setQ} placeholder="Search by name or position" label="Search staff" />
      {staff.error ? (
        <ErrorState error={staff.error as Error} onRetry={staff.reload} />
      ) : (
        <Table
          compact
          caption="Staff and leave balances"
          loading={staff.loading && !staff.data}
          rows={rows}
          rowKey={(s) => s.employeeId}
          onRowClick={onSelect ? (s) => onSelect(s.employeeId) : undefined}
          isSelected={(s) => s.employeeId === selected}
          empty={<EmptyState title="No staff found" />}
          columns={[
            { key: "name", header: "Employee", render: (s) => <span className="font-semibold text-navy">{s.fullName}</span> },
            { key: "pos", header: "Position", hideOnMobile: true, render: (s) => s.jobTitle },
            { key: "mgr", header: "Line manager", hideOnMobile: true, render: (s) => s.managerName || "HR decides" },
            { key: "bf", header: "Brought fwd", hideOnMobile: true, render: (s) => s.broughtForwardDays },
            { key: "acc", header: "Accrued", hideOnMobile: true, render: (s) => s.accruedDays },
            { key: "taken", header: "Taken", render: (s) => s.takenDays },
            { key: "left", header: "Left", render: (s) => <strong className="text-ink">{s.remainingDays}</strong> },
            { key: "sick", header: "Sick", hideOnMobile: true, render: (s) => dash(s.sickDays) },
            { key: "trn", header: "Training", hideOnMobile: true, render: (s) => dash(s.trainingDays) },
            { key: "oth", header: "Other", hideOnMobile: true, render: (s) => dash(s.otherDays) },
            { key: "pend", header: "Pending", render: (s) => (s.pendingRequests > 0 ? `${s.pendingRequests} req. / ${s.pendingDays}d` : "–") },
            { key: "out", header: "Today", render: (s) => (s.outNow ? <Pill tone="info">{s.outNowReason}</Pill> : <span className="text-muted">In</span>) },
            { key: "cf", header: `Carried forward to ${next}`, render: (s) => <strong className="text-navy">{s.carriedForwardDays}</strong> },
          ]}
        />
      )}
    </>
  );
}
