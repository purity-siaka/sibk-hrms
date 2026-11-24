"use client";

import { DocumentChecklist } from "@/components/DocumentChecklist";
import { ErrorState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { BlockSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/api";

export default function MyDocuments() {
  const toast = useToast();
  const list = useAsync(() => api.me.documents(), []);
  const required = (list.data ?? []).filter((i) => i.required);
  const done = required.filter((i) => i.document && i.document.status !== "rejected").length;
  return (
    <>
      <PageHeader title="My documents" subtitle={list.data ? `${done} of ${required.length} required documents uploaded. HR verifies each one.` : undefined} />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <BlockSkeleton lines={8} />
      ) : (
        <DocumentChecklist
          items={list.data ?? []}
          mode="self"
          onUpload={async (type, file, expiry) => {
            await api.me.uploadDocument(file, type, expiry || undefined);
            toast.success("Document uploaded. HR will review it.");
            list.reload();
          }}
          onDownload={(d) => void toast.run(api.documents.download(d), "Download started")}
          onDelete={async (d) => {
            if (window.confirm(`Remove ${d.typeLabel}?`) && (await toast.run(api.documents.remove(d.id), "Document removed"))) list.reload();
          }}
        />
      )}
    </>
  );
}
