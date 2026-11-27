"use client";

import Link from "next/link";
import { AuthImage } from "@/components/AuthImage";
import { Card, StatCard } from "@/components/Card";
import { ErrorState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/Pill";
import { BlockSkeleton } from "@/components/Skeleton";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export default function MeHome() {
  const { data, error, loading, reload } = useAsync(() => api.me.dashboard(), []);
  const leave = useAsync(() => api.leave.me(), []);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <BlockSkeleton lines={6} />;
  const e = data.employee;
  const missing = data.documentsRequired - data.documentsUploaded;
  return (
    <>
      <PageHeader title={`Welcome, ${e.firstName || e.fullName.split(" ")[0]}`} subtitle="Your details, documents and requests in one place." />
      <Card>
        <div className="flex items-center gap-5">
          <AuthImage employeeId={e.id} name={e.fullName} hasPhoto={e.hasPhoto} className="h-[96px] w-[78px] rounded-xl border border-line" textClass="text-2xl" />
          <div className="min-w-0">
            <p className="text-xl font-bold text-ink">{e.fullName}</p>
            <p className="text-muted">{e.jobTitle}{e.departmentName && ` · ${e.departmentName}`}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              <StatusPill status={e.status} />
              <span>Staff no. {e.employeeNo}</span>
              {e.managerName && <span>· Reports to {e.managerName}</span>}
            </div>
          </div>
        </div>
      </Card>

      {missing > 0 && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-gold bg-gold-soft px-5 py-4">
          <p className="text-sm text-ink">
            <strong>{missing} required {missing === 1 ? "document is" : "documents are"} still missing.</strong> Upload them so HR can verify your file.
          </p>
          <Link href="/me/documents" className="rounded-[10px] bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-blue">
            Upload documents
          </Link>
        </div>
      )}

      {leave.data && leave.data.pendingApprovals > 0 && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-gold bg-gold-soft px-5 py-4">
          <p className="text-sm text-ink">
            <strong>{leave.data.pendingApprovals} leave {leave.data.pendingApprovals === 1 ? "request is" : "requests are"} waiting for your decision.</strong>
          </p>
          <Link href="/me/leave" className="rounded-[10px] bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-blue">
            Review requests
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Annual leave remaining" value={leave.data ? leave.data.balance.remainingDays : "…"} href="/me/leave" hint={leave.data && leave.data.balance.pendingDays > 0 ? `${leave.data.balance.pendingDays} awaiting approval` : undefined} />
        <StatCard label="Required documents uploaded" value={`${data.documentsUploaded}/${data.documentsRequired}`} href="/me/documents" />
        <StatCard label="Awaiting HR review" value={data.documentsPending} href="/me/documents" />
      </div>

      <Card title="Announcements">
        {data.announcements.length === 0 ? (
          <p className="text-sm text-muted">No announcements right now.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.announcements.map((a) => (
              <li key={a.id} className="py-3">
                <p className="font-semibold text-ink">{a.title}</p>
                <p className="text-xs text-muted">{fmtDate(a.createdAt)}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
