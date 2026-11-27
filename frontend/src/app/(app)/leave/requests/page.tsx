"use client";

import Link from "next/link";
import { useState } from "react";
import { FilterBar, PageHeader } from "@/components/PageHeader";
import { FilterSelect, SearchInput } from "@/components/Fields";
import { ErrorState, EmptyState } from "@/components/EmptyState";
import { DateRange, LeaveActions, LeaveStatusCell, TypeCell } from "@/components/LeavePanel";
import { Pagination } from "@/components/Pagination";
import { Table } from "@/components/Table";
import { useDebounced } from "@/hooks/useDebounced";
import { useAsync } from "@/hooks/useAsync";
import { useReference } from "@/hooks/useReference";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const SIZE = 20;

export default function AllLeave() {
  const ref = useReference();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q, 300);
  const list = useAsync(() => api.leave.list({ q: dq, status, type, page, pageSize: SIZE }), [dq, status, type, page]);

  return (
    <>
      <PageHeader title="All requests" subtitle="Every leave request across the bank." />
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by employee name" label="Search leave requests" />
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }}>
          <option value="">All statuses</option>
          {["pending", "approved", "rejected", "cancelled"].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="Leave type" value={type} onChange={(v) => { setType(v); setPage(1); }}>
          <option value="">All types</option>
          {ref.leaveTypes.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </FilterSelect>
      </FilterBar>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <>
          <Table
            caption="Leave requests"
            loading={list.loading && !list.data}
            rows={list.data?.items ?? []}
            rowKey={(l) => l.id}
            empty={<EmptyState title="No leave requests found" text="Try a different filter." />}
            columns={[
              { key: "emp", header: "Employee", render: (l) => <Link href={`/employees/${l.employeeId}`} className="font-semibold text-navy hover:underline">{l.employeeName}</Link> },
              { key: "type", header: "Type", render: (l) => <TypeCell l={l} /> },
              { key: "dates", header: "Dates", render: (l) => <DateRange l={l} /> },
              { key: "days", header: "Days", render: (l) => l.days },
              { key: "status", header: "Status", render: (l) => <LeaveStatusCell l={l} /> },
              {
                key: "by",
                header: "Decision",
                hideOnMobile: true,
                render: (l) => (
                  <span className="text-sm text-muted">
                    {l.status === "pending" ? `Waiting for ${l.approverName}` : [l.decidedByName, l.decidedAt && fmtDate(l.decidedAt)].filter(Boolean).join(", ")}
                  </span>
                ),
              },
              { key: "act", header: "", render: (l) => <LeaveActions l={l} onChange={list.reload} /> },
            ]}
          />
          <Pagination page={page} pageSize={SIZE} total={list.data?.total ?? 0} onChange={setPage} />
        </>
      )}
    </>
  );
}
