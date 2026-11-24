"use client";

import { Download, Plus } from "lucide-react";
import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, api } from "@/lib/api";
import { isHR } from "@/lib/access";
import { fmtDate } from "@/lib/format";
import { Button } from "./Button";
import { EmptyState, ErrorState } from "./EmptyState";
import { FormGrid, Input } from "./Fields";
import { DOC_ACCEPT, DOC_MAX, FileDrop } from "./FileDrop";
import { Modal } from "./Modal";
import { PageHeader } from "./PageHeader";
import { Table } from "./Table";
import { useToast } from "./Toast";

export function PoliciesView() {
  const { user } = useAuth();
  const toast = useToast();
  const list = useAsync(() => api.policies.list(), []);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [eff, setEff] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Title is required.";
    if (!file) e.file = "Attach the policy document.";
    setErrs(e);
    if (Object.keys(e).length || !file) return;
    setBusy(true);
    try {
      await api.policies.create({ title: title.trim(), version, effectiveDate: eff, file });
      toast.success("Policy uploaded");
      setOpen(false);
      setTitle(""); setVersion(""); setEff(""); setFile(null);
      list.reload();
    } catch (err) {
      setErrs(err instanceof ApiError ? err.fields : { title: "Could not upload" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Policies"
        subtitle="The current HR Policy and related documents."
        actions={isHR(user) && <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setOpen(true)}>Upload policy</Button>}
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <Table
          caption="Policies"
          loading={list.loading && !list.data}
          rows={list.data ?? []}
          rowKey={(p) => p.id}
          empty={<EmptyState title="No policies uploaded yet" />}
          columns={[
            { key: "t", header: "Policy", render: (p) => <span className="font-semibold text-ink">{p.title}</span> },
            { key: "v", header: "Version", render: (p) => p.version || "n/a" },
            { key: "e", header: "Effective", render: (p) => fmtDate(p.effectiveDate) || "n/a" },
            { key: "u", header: "Uploaded", render: (p) => fmtDate(p.uploadedAt) },
            { key: "d", header: "", render: (p) => <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void toast.run(api.policies.download(p), "Download started")}>Open</Button> },
          ]}
        />
      )}
      <Modal open={open} title="Upload policy" onClose={() => setOpen(false)} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={save}>Upload</Button></>}>
        <div className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={errs.title} required />
          <FormGrid>
            <Input label="Version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" />
            <Input label="Effective date" type="date" value={eff} onChange={(e) => setEff(e.target.value)} error={errs.effectiveDate} />
          </FormGrid>
          <FileDrop label="Document" file={file} onChange={setFile} accept={DOC_ACCEPT} maxBytes={DOC_MAX} error={errs.file} />
        </div>
      </Modal>
    </>
  );
}
