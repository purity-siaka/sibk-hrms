"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/Button";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { BlockSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/api";

const REPORTS = [
  { key: "out-now", title: "Who's out now" },
  { key: "pending", title: "Pending approvals" },
  { key: "upcoming", title: "Upcoming leave (90 days)" },
  { key: "balances", title: "Leave balances" },
  { key: "sick-no-note", title: "Sick leave without note" },
  { key: "audit", title: "Approval audit trail" },
];

export default function LeaveReports() {
  const toast = useToast();
  const [key, setKey] = useState("out-now");
  const rep = useAsync(() => api.leave.report(key), [key]);
  return (
    <>
      <PageHeader
        title="Leave reports"
        subtitle="Choose a report. Download opens in Excel."
        actions={
          <Button variant="gold" icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void toast.run(api.leave.downloadReport(key), "Report downloaded")}>
            Download for Excel
          </Button>
        }
      />
      <div role="tablist" aria-label="Reports" className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            role="tab"
            aria-selected={r.key === key}
            onClick={() => setKey(r.key)}
            className={`min-h-[40px] rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
              r.key === key ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:bg-blue-soft"
            }`}
          >
            {r.title}
          </button>
        ))}
      </div>
      {rep.error ? (
        <ErrorState error={rep.error} onRetry={rep.reload} />
      ) : rep.loading && !rep.data ? (
        <BlockSkeleton lines={6} />
      ) : rep.data && rep.data.rows.length === 0 ? (
        <EmptyState title="Nothing to report" text="There are no records for this report right now." />
      ) : (
        rep.data && (
          <div className="overflow-x-auto rounded-[14px] border border-line bg-white shadow-card">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">{rep.data.title}</caption>
              <thead>
                <tr className="border-b border-line bg-[#F8F9FD]">
                  {rep.data.columns.map((c) => (
                    <th key={c} scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rep.data.rows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {r.map((c, j) => (
                      <td key={j} className={`px-4 py-3 ${j === 0 ? "font-semibold text-ink" : "text-ink"}`}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </>
  );
}
