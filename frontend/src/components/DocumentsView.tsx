"use client";

import Link from "next/link";
import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { useReference } from "@/hooks/useReference";
import { api } from "@/lib/api";
import { daysUntil, fmtDate } from "@/lib/format";
import type { DocumentRecord } from "@/lib/types";
import { Button } from "./Button";
import { usePreview } from "./FilePreview";
import { EmptyState, ErrorState } from "./EmptyState";
import { FilterSelect } from "./Fields";
import { FilterBar, PageHeader } from "./PageHeader";
import { Pagination } from "./Pagination";
import { StatusPill } from "./Pill";
import { ReasonModal } from "./ReasonModal";
import { Table } from "./Table";
import { useToast } from "./Toast";

const SIZE = 25;

export function DocumentsView({ mode }: { mode: "pending" | "all" | "expiring" }) {
  const toast = useToast();
  const { preview, node: previewNode } = usePreview();
  const ref = useReference();
  const [type, setType] = useState("");
  const [status, setStatus] = useState(mode === "pending" ? "pending" : "");
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<DocumentRecord | null>(null);
  const list = useAsync(
    () => api.documents.list({ status: status as "", type, expiring: mode === "expiring", page, pageSize: SIZE }),
    [status, type, mode, page],
  );
  const titles = {
    pending: ["Documents awaiting review", "Uploads from employees that HR has not yet checked."],
    all: ["All documents", "Every document uploaded to the system."],
    expiring: ["Expiring documents", "Documents that expire within 60 days or have already expired."],
  } as const;

  return (
    <>
      {previewNode}
      <PageHeader title={titles[mode][0]} subtitle={titles[mode][1]} />
      <FilterBar>
        <FilterSelect label="Document type" value={type} onChange={(v) => { setType(v); setPage(1); }}>
          <option value="">All types</option>
          {ref.documentTypes.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </FilterSelect>
        {mode !== "pending" && (
          <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </FilterSelect>
        )}
      </FilterBar>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <>
          <Table
            caption={titles[mode][0]}
            loading={list.loading && !list.data}
            rows={list.data?.items ?? []}
            rowKey={(d) => d.id}
            empty={<EmptyState title={mode === "pending" ? "All caught up" : "No documents found"} text={mode === "pending" ? "There is nothing waiting for review." : undefined} />}
            columns={[
              { key: "e", header: "Employee", render: (d) => <Link className="font-semibold text-navy hover:underline" href={`/employees/${d.employeeId}`}>{d.employeeName}</Link> },
              { key: "t", header: "Document", render: (d) => d.typeLabel },
              { key: "f", header: "File", render: (d) => <span className="block max-w-[200px] truncate">{d.fileName}</span> },
              { key: "u", header: "Uploaded", render: (d) => fmtDate(d.uploadedAt) },
              {
                key: "x",
                header: "Expires",
                render: (d) => {
                  if (!d.expiryDate) return <span className="text-muted">None</span>;
                  const n = daysUntil(d.expiryDate);
                  return <span className={n !== null && n <= 60 ? "font-semibold text-danger" : ""}>{fmtDate(d.expiryDate)}{n !== null && n < 0 ? " (expired)" : ""}</span>;
                },
              },
              { key: "s", header: "Status", render: (d) => <StatusPill status={d.status} /> },
              {
                key: "a",
                header: "Actions",
                render: (d) => (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => preview({ path: `/documents/${d.id}/download`, fileName: d.fileName, title: d.fileName })}>Preview</Button>
                    {d.status !== "verified" && (
                      <Button size="sm" onClick={async () => { if (await toast.run(api.documents.verify(d.id), "Document verified")) list.reload(); }}>Verify</Button>
                    )}
                    {d.status !== "rejected" && (
                      <Button size="sm" variant="danger" onClick={() => setRejecting(d)}>Reject</Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
          <Pagination page={page} pageSize={SIZE} total={list.data?.total ?? 0} onChange={setPage} />
        </>
      )}
      <ReasonModal
        open={!!rejecting}
        title="Reject document"
        label="What should the employee fix?"
        confirmLabel="Reject"
        tone="danger"
        required
        onClose={() => setRejecting(null)}
        onSubmit={async (reason) => {
          if (!rejecting) return;
          await api.documents.reject(rejecting.id, reason);
          toast.success("Document rejected");
          list.reload();
        }}
      />
    </>
  );
}
