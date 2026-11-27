"use client";

import { useState } from "react";
import { ApprovalList, LeavePanel } from "@/components/LeavePanel";
import { ErrorState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { BlockSkeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/api";
import { isHR } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { NextHoliday } from "@/components/NextHoliday";
import { LeaveReportsView } from "@/components/LeaveReportsView";
import { StaffLeaveTable } from "@/components/StaffLeaveTable";

export default function MyLeave() {
  const { user } = useAuth();
  const [tab, setTab] = useState("mine");
  const team = !!user && !isHR(user);
  const mine = useAsync(() => api.leave.me(), []);
  const approvals = useAsync(() => api.leave.approvals(), []);
  const isTeam = team && (approvals.data?.canApprove ?? false);
  const staff = useAsync(() => (isTeam ? api.leave.staff() : Promise.resolve([])), [isTeam]);
  const reloadAll = () => {
    mine.reload();
    approvals.reload();
    staff.reload();
  };
  const canApprove = approvals.data?.canApprove ?? false;
  const count = approvals.data?.items.length ?? 0;
  const tabs = [{ key: "mine", label: "My leave" }, ...(canApprove ? [{ key: "approvals", label: "Approvals", badge: count || undefined }, ...(isTeam ? [{ key: "team", label: "My team" }, { key: "reports", label: "Team reports" }] : [])] : [])];

  return (
    <>
      <PageHeader title="Leave" subtitle="Apply for leave and follow your requests. Weekends and public holidays are not counted." />
      {canApprove && <Tabs items={tabs} active={tab} onChange={setTab} label="Leave sections" />}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-4">
        {tab === "mine" &&
          (mine.error ? (
            <ErrorState error={mine.error} onRetry={mine.reload} />
          ) : mine.loading && !mine.data ? (
            <BlockSkeleton lines={8} />
          ) : (
            mine.data && (
              <>
                <LeavePanel summary={mine.data} onChange={reloadAll} canApply />
                <NextHoliday holidays={mine.data.upcomingHolidays ?? []} />
              </>
            )
          ))}
        {tab === "approvals" &&
          (approvals.error ? (
            <ErrorState error={approvals.error} onRetry={approvals.reload} />
          ) : (
            <ApprovalList items={approvals.data?.items ?? []} onChange={reloadAll} empty="You have no leave requests to decide right now." />
          ))}
        {tab === "team" && <StaffLeaveTable staff={staff} />}
        {tab === "reports" && <LeaveReportsView intro="Leave reports for the people who report to you. Export to Excel downloads the report you are viewing." />}
      </div>
    </>
  );
}
