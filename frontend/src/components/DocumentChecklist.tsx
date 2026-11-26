"use client";

import { CheckCircle2, Eye, FileText, Trash2, Upload, XCircle } from "lucide-react";
import { useState } from "react";
import type { ChecklistItem, DocumentRecord } from "@/lib/types";
import { daysUntil, fmtDate, fmtSize } from "@/lib/format";
import { Button } from "./Button";
import { usePreview } from "./FilePreview";
import { Input } from "./Fields";
import { DOC_ACCEPT, DOC_MAX, FileDrop } from "./FileDrop";
import { Modal } from "./Modal";
import { Pill, StatusPill } from "./Pill";
import { ReasonModal } from "./ReasonModal";

interface Props {
  items: ChecklistItem[];
  /** "hr" shows verify/reject; "self" shows upload and delete-while-pending */
  mode: "hr" | "self";
  onUpload: (type: string, file: File, expiryDate: string) => Promise<void>;
  /** kept for compatibility; files now open in the preview window */
  onDownload?: (d: DocumentRecord) => void;
  onVerify?: (d: DocumentRecord) => Promise<void>;
  onReject?: (d: DocumentRecord, reason: string) => Promise<void>;
  onDelete?: (d: DocumentRecord) => Promise<void>;
}

export function DocumentChecklist({ items, mode, onUpload, onVerify, onReject, onDelete }: Props) {
  const { preview, node: previewNode } = usePreview();
  const [uploadFor, setUploadFor] = useState<ChecklistItem | null>(null);
  const [rejecting, setRejecting] = useState<DocumentRecord | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [working, setWorking] = useState<number | null>(null);

  const closeUpload = () => {
    setUploadFor(null);
    setFile(null);
    setExpiry("");
    setErr("");
  };
  const submitUpload = async () => {
    if (!uploadFor || !file) {
      setErr("Choose a file first.");
      return;
    }
    setBusy(true);
    try {
      await onUpload(uploadFor.type, file, expiry);
      closeUpload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  const act = async (d: DocumentRecord, fn?: (d: DocumentRecord) => Promise<void>) => {
    if (!fn) return;
    setWorking(d.id);
    try {
      await fn(d);
    } finally {
      setWorking(null);
    }
  };

  return (
    <>
      {previewNode}
      <ul className="divide-y divide-line rounded-[14px] border border-line bg-white shadow-card">
        {items.map((it) => {
          const d = it.document;
          const days = daysUntil(d?.expiryDate);
          return (
            <li key={it.type} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span aria-hidden className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${d ? "bg-blue-soft text-navy" : "bg-[#EDEFF5] text-muted"}`}>
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                    {it.label}
                    {it.required ? <Pill tone="info">Required</Pill> : <Pill>Optional</Pill>}
                  </p>
                  {d ? (
                    <p className="mt-0.5 truncate text-sm text-muted">
                      {d.fileName} · {fmtSize(d.size)} · uploaded {fmtDate(d.uploadedAt)}
                      {d.expiryDate && (
                        <span className={days !== null && days <= 60 ? "font-semibold text-danger" : ""}>
                          {" "}
                          · {days !== null && days < 0 ? "expired" : "expires"} {fmtDate(d.expiryDate)}
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-muted">Not uploaded yet</p>
                  )}
                  {d?.status === "rejected" && d.rejectionReason && <p className="mt-1 text-sm text-danger">Rejected: {d.rejectionReason}</p>}
                  {d?.status === "verified" && d.verifiedByName && <p className="mt-0.5 text-xs text-muted">Verified by {d.verifiedByName}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {d ? <StatusPill status={d.status} /> : it.required ? <StatusPill status="missing" label="Missing" /> : null}
                {d && (
                  <Button variant="ghost" size="sm" icon={<Eye className="h-4 w-4" aria-hidden />} onClick={() => preview({ path: `/documents/${d.id}/download`, fileName: d.fileName, title: it.label })} aria-label={`Preview ${it.label}`}>
                    Preview
                  </Button>
                )}
                {mode === "hr" && d && d.status !== "verified" && (
                  <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" aria-hidden />} loading={working === d.id} onClick={() => act(d, onVerify)}>
                    Verify
                  </Button>
                )}
                {mode === "hr" && d && d.status !== "rejected" && (
                  <Button variant="danger" size="sm" icon={<XCircle className="h-4 w-4" aria-hidden />} onClick={() => setRejecting(d)}>
                    Reject
                  </Button>
                )}
                {(mode === "hr" || !d || d.status !== "verified") && (
                  <Button variant={d ? "ghost" : "gold"} size="sm" icon={<Upload className="h-4 w-4" aria-hidden />} onClick={() => setUploadFor(it)}>
                    {d ? "Replace" : "Upload"}
                  </Button>
                )}
                {d && onDelete && (mode === "hr" || d.status === "pending") && (
                  <Button variant="quiet" size="sm" aria-label={`Delete ${it.label}`} icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => act(d, onDelete)} />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        open={!!uploadFor}
        title={uploadFor ? `Upload: ${uploadFor.label}` : "Upload"}
        onClose={closeUpload}
        footer={
          <>
            <Button variant="ghost" onClick={closeUpload}>
              Cancel
            </Button>
            <Button loading={busy} onClick={submitUpload} disabled={!file}>
              Upload
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FileDrop label="File" file={file} onChange={setFile} accept={DOC_ACCEPT} maxBytes={DOC_MAX} hint="PDF, JPG, PNG or DOCX, up to 10 MB" error={err} />
          <Input label="Expiry date (if it expires)" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} hint="HR is reminded 60 days before this date." />
        </div>
      </Modal>

      <ReasonModal
        open={!!rejecting}
        title="Reject document"
        label="What should the employee fix?"
        confirmLabel="Reject"
        tone="danger"
        required
        onClose={() => setRejecting(null)}
        onSubmit={async (reason) => {
          if (rejecting && onReject) await onReject(rejecting, reason);
        }}
      />
    </>
  );
}
