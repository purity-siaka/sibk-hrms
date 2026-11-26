"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/api";
import { Button } from "./Button";
import { EmptyState, ErrorState } from "./EmptyState";
import { BlockSkeleton } from "./Skeleton";
import { useToast } from "./Toast";

/** Report picker, table and a single "Export to Excel" download. The server decides which reports the viewer may open and whose people they cover. */
export function LeaveReportsView({ intro }: { intro?: string }) {
  const toast = useToast();
  const list = useAsync(() => api.leave.reportList(), []);
  const [picked, setPicked] = useState("");
  const key = picked || list.data?.[0]?.key || "";
  const rep = useAsync(() => (key ? api.leave.report(key) : Promise.resolve(null)), [key]);
  const [exporting, setExporting] = useState(false);

  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (list.loading && !list.data) return <BlockSkeleton lines={4} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{intro ?? "Choose a report. Export to Excel saves it on this computer."}</p>
        <Button
          variant="gold"
          icon={<Download className="h-4 w-4" aria-hidden />}
          loading={exporting}
          disabled={!key}
          onClick={async () => {
            setExporting(true);
            await toast.run(api.leave.exportReport(key), "Excel file downloaded");
            setExporting(false);
          }}
        >
          Export to Excel
        </Button>
      </div>
      <div role="tablist" aria-label="Reports" className="flex flex-wrap gap-2">
        {(list.data ?? []).map((r) => (
          <button
            key={r.key}
            role="tab"
            aria-selected={r.key === key}
            onClick={() => setPicked(r.key)}
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
                  <tr key={i} className="border-b border-line align-top last:border-0">
                    {r.map((c, j) => (
                      <td key={j} className={`px-4 py-3 ${j === 0 ? "font-semibold text-ink" : "text-ink"} ${j === r.length - 1 && rep.data!.key === "balances" ? "font-bold text-navy" : ""} ${/^\d{4}-\d{2}-\d{2}/.test(c) ? "whitespace-nowrap" : ""}`}>
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
    </div>
  );
}
