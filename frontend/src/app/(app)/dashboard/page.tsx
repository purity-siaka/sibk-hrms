"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Card, StatCard } from "@/components/Card";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/Pill";
import { BlockSkeleton } from "@/components/Skeleton";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { isHR } from "@/lib/access";
import { fmtDate } from "@/lib/format";
import type { DatedPerson } from "@/lib/types";

function DateList({ items, empty, unit }: { items: DatedPerson[]; empty: string; unit: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((p) => (
        <li key={p.employeeId} className="flex items-center justify-between gap-3 py-2.5">
          <Link href={`/employees/${p.employeeId}`} className="font-medium text-navy hover:underline">
            {p.fullName}
          </Link>
          <span className={`text-sm ${p.daysLeft <= 14 ? "font-semibold text-danger" : "text-muted"}`}>
            {fmtDate(p.date)} · {p.daysLeft < 0 ? `${-p.daysLeft} days over` : p.daysLeft === 0 ? "today" : `${p.daysLeft} ${unit}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const hr = isHR(user);
  useEffect(() => {
    if (user && !hr) router.replace("/employees");
  }, [user, hr, router]);
  const { data, error, loading, reload } = useAsync(() => (hr ? api.dashboard() : Promise.resolve(null)), [hr]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <BlockSkeleton lines={6} />
      </>
    );
  }
  const maxDept = Math.max(1, ...data.byDepartment.map((d) => d.count));
  const needAction = data.pendingDocuments + data.pendingChangeRequests;

  return (
    <>
      <PageHeader title="HR dashboard" subtitle={needAction ? `${needAction} items are waiting for your decision.` : "Nothing is waiting for you right now."} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Employees" value={data.headcount} href="/employees" />
        <StatCard label="Documents to review" value={data.pendingDocuments} tone={data.pendingDocuments ? "gold" : "navy"} href="/documents" />
        <StatCard label="Employees missing documents" value={data.employeesMissingDocuments} tone={data.employeesMissingDocuments ? "danger" : "navy"} href="/documents/all" />
        <StatCard label="Documents expiring (60 days)" value={data.expiringDocuments} tone={data.expiringDocuments ? "danger" : "navy"} href="/documents/expiring" />
        <StatCard label="Profile change requests" value={data.pendingChangeRequests} href="/change-requests" />
        <StatCard label="Open tasks" value={data.openTasks} hint={data.overdueTasks ? `${data.overdueTasks} overdue` : undefined} tone={data.overdueTasks ? "danger" : "navy"} href="/tasks" />
        <StatCard label="Open positions" value={data.openJobs} href="/recruitment/jobs" />
        <StatCard label="Active applicants" value={data.activeApplicants} href="/recruitment" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Headcount by department">
          {data.byDepartment.length === 0 ? (
            <p className="text-sm text-muted">No employees yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.byDepartment.map((d) => (
                <li key={d.name}>
                  <div className="flex justify-between text-sm">
                    <span className="text-ink">{d.name}</span>
                    <span className="font-semibold text-navy">{d.count}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-[#E6EAF5]" aria-hidden>
                    <div className="h-2 rounded-full bg-navy" style={{ width: `${(d.count / maxDept) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {data.byStatus.map((s) => (
              <span key={s.status} className="inline-flex items-center gap-1.5 text-sm text-muted">
                <StatusPill status={s.status} /> {s.count}
              </span>
            ))}
          </div>
        </Card>

        <Card title="Recent uploads" action={<Link href="/documents" className="text-sm font-semibold text-navy hover:underline">Review all</Link>}>
          {data.recentUploads.length === 0 ? (
            <EmptyState title="No uploads yet" text="Documents employees upload appear here." />
          ) : (
            <ul className="divide-y divide-line">
              {data.recentUploads.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/employees/${d.employeeId}`} className="block truncate font-medium text-navy hover:underline">
                      {d.employeeName}
                    </Link>
                    <p className="truncate text-sm text-muted">
                      {d.typeLabel} · {fmtDate(d.uploadedAt)}
                    </p>
                  </div>
                  <StatusPill status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Probation ending (next 60 days)">
          <DateList items={data.probationEnding} empty="No probation periods are ending soon." unit="days left" />
        </Card>
        <Card title="Contracts ending (next 60 days)">
          <DateList items={data.contractsEnding} empty="No contracts are ending soon." unit="days left" />
        </Card>
        <Card title="Work anniversaries (next 30 days)">
          {data.anniversaries.length === 0 ? (
            <p className="text-sm text-muted">No anniversaries coming up.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.anniversaries.map((a) => (
                <li key={a.employeeId} className="flex justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/employees/${a.employeeId}`} className="font-medium text-navy hover:underline">
                    {a.fullName}
                  </Link>
                  <span className="text-muted">
                    {fmtDate(a.date)} · {a.years} {a.years === 1 ? "year" : "years"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Quick links">
          <ul className="grid gap-2 text-sm font-semibold text-navy sm:grid-cols-2">
            {[
              ["/employees/new", "Add an employee"],
              ["/recruitment", "Applications"],
              ["/reports", "Download reports"],
              ["/announcements", "Post an announcement"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="block rounded-[10px] border border-line px-3 py-2.5 hover:bg-[#EEF1FB]">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
