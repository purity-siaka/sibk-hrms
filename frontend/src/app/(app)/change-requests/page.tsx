"use client";

import Link from "next/link";
import { useState } from "react";
import { DecisionButtons } from "@/components/DecisionButtons";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { FilterSelect } from "@/components/Fields";
import { FilterBar, PageHeader } from "@/components/PageHeader";
import { Pill, StatusPill } from "@/components/Pill";
import { Table } from "@/components/Table";
import { useToast } from "@/components/Toast";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { CHANGE_FIELDS } from "@/lib/types";

export default function ChangeRequestsPage() {
  const toast = useToast();
  const [status, setStatus] = useState("pending");
  const list = useAsync(() => api.changeRequests.list(status), [status]);
  const label = (k: string) => CHANGE_FIELDS.find((f) => f.key === k)?.label ?? k;
  return (
    <>
      <PageHeader title="Profile change requests" subtitle="Employees ask HR to change sensitive details such as bank account. Confirm bank changes with the employee before approving." />
      <FilterBar>
        <FilterSelect label="Status" value={status} onChange={setStatus}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </FilterSelect>
      </FilterBar>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <Table
          caption="Profile change requests"
          loading={list.loading && !list.data}
          rows={list.data ?? []}
          rowKey={(c) => c.id}
          empty={<EmptyState title="No change requests" />}
          columns={[
            { key: "e", header: "Employee", render: (c) => <Link className="font-semibold text-navy hover:underline" href={`/employees/${c.employeeId}`}>{c.employeeName}</Link> },
            { key: "f", header: "Field", render: (c) => (<span>{label(c.field)} {c.isBankChange && <Pill tone="wait">Bank</Pill>}</span>) },
            { key: "o", header: "Current", render: (c) => c.oldValue || <span className="text-muted">Empty</span> },
            { key: "n", header: "Requested", render: (c) => <span className="font-semibold">{c.newValue}</span> },
            { key: "r", header: "Reason", render: (c) => c.reason || <span className="text-muted">None</span> },
            { key: "d", header: "Date", render: (c) => fmtDate(c.createdAt) },
            {
              key: "a",
              header: "Decision",
              render: (c) =>
                c.status === "pending" ? (
                  <DecisionButtons
                    subject={`${label(c.field)} change for ${c.employeeName}`}
                    onApprove={async () => { if (await toast.run(api.changeRequests.decide(c.id, true), "Change applied")) list.reload(); }}
                    onReject={async (note) => { await api.changeRequests.decide(c.id, false, note); toast.success("Request rejected"); list.reload(); }}
                  />
                ) : (
                  <span className="inline-flex items-center gap-2"><StatusPill status={c.status} /><span className="text-sm text-muted">{c.decidedByName}</span></span>
                ),
            },
          ]}
        />
      )}
    </>
  );
}
