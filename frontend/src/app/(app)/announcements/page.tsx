"use client";

import { Pin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { Checkbox, Input, Textarea } from "@/components/Fields";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, api } from "@/lib/api";
import { isHR } from "@/lib/access";
import { fmtDate } from "@/lib/format";

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const list = useAsync(() => api.announcements.list(), []);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const hr = isHR(user);

  const save = async () => {
    setBusy(true);
    try {
      await api.announcements.create({ title, body, pinned });
      toast.success("Announcement posted");
      setOpen(false); setTitle(""); setBody(""); setPinned(false); setErrs({});
      list.reload();
    } catch (e) {
      setErrs(e instanceof ApiError ? e.fields : { title: "Could not post" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Announcements" subtitle="Company notices shown on every employee's home page." actions={hr && <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setOpen(true)}>New announcement</Button>} />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (list.data ?? []).length === 0 && !list.loading ? (
        <EmptyState title="No announcements" />
      ) : (
        <div className="space-y-4">
          {(list.data ?? []).map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
                    {a.pinned && <Pin className="h-4 w-4 text-gold" aria-label="Pinned" />}
                    {a.title}
                  </h2>
                  <p className="text-xs text-muted">{a.createdByName} · {fmtDate(a.createdAt)}</p>
                </div>
                {hr && <Button size="sm" variant="danger" aria-label={`Delete ${a.title}`} icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={async () => { if (window.confirm("Delete this announcement?") && (await toast.run(api.announcements.remove(a.id), "Announcement deleted"))) list.reload(); }} />}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-[15px] text-ink">{a.body}</p>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} title="New announcement" onClose={() => setOpen(false)} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={save}>Post</Button></>}>
        <div className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={errs.title} required />
          <Textarea label="Message" rows={6} value={body} onChange={(e) => setBody(e.target.value)} error={errs.body} required />
          <Checkbox label="Pin to the top" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        </div>
      </Modal>
    </>
  );
}
