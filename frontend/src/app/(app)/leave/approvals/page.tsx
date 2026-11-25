"use client";

import { ApprovalList, DateRange } from "@/components/LeavePanel";
import { Table } from "@/components/Table";
import { ErrorState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { BlockSkeleton } from "@/components/Skeleton";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/api";

export default function LeaveApprovals() {
  const q = useAsync(() => api.leave.approvals(), []);
  const waiting = useAsync(() => api.leave.list({ status: "pending", pageSize: 100 }), []);
  const withManagers = (waiting.data?.items ?? []).filter((l) => l.approverType !== "hr");
  return (
    <>
      <PageHeader
        title="Leave approvals"
        subtitle="Only requests that need HR's own decision: people with no manager stage (for example the CEO) or whose manager is set not to approve. Everything else is decided by the employee's line manager."
      />
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : q.loading && !q.data ? <BlockSkeleton lines={6} /> : <ApprovalList items={q.data?.items ?? []} onChange={q.reload} empty="No requests are waiting for HR." />}
      {withManagers.length > 0 && (
        <section className="space-y-3 pt-4">
          <h2 className="text-lg font-bold text-ink">For your information: waiting for line managers</h2>
          <p className="text-sm text-muted">HR is told when a request is made. No action is needed until the manager decides.</p>
          <Table
            caption="Requests waiting for line managers"
            rows={withManagers}
            rowKey={(l) => l.id}
            columns={[
              { key: "emp", header: "Employee", render: (l) => <span className="font-semibold text-ink">{l.employeeName}</span> },
              { key: "type", header: "Request", render: (l) => (l.type === "training" ? `Training: ${l.trainingTitle ?? ""}` : `${l.typeLabel} leave`) },
              { key: "dates", header: "Dates", render: (l) => <DateRange l={l} /> },
              { key: "days", header: "Days", render: (l) => l.days },
              { key: "who", header: "Awaiting approval of", render: (l) => l.approverName },
            ]}
          />
        </section>
      )}
    </>
  );
}
