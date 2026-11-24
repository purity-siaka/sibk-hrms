"use client";

import { ApprovalList } from "@/components/LeavePanel";
import { ErrorState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { BlockSkeleton } from "@/components/Skeleton";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/api";

export default function LeaveApprovals() {
  const q = useAsync(() => api.leave.approvals(), []);
  return (
    <>
      <PageHeader
        title="Leave approvals"
        subtitle="Requests that need HR to decide: managers' leave and staff with no line manager. Staff with a line manager are decided by that manager; HR sees those under All requests."
      />
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : q.loading && !q.data ? <BlockSkeleton lines={6} /> : <ApprovalList items={q.data?.items ?? []} onChange={q.reload} empty="No requests are waiting for HR." />}
    </>
  );
}
