"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/Button";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { FormGrid, Input, Select, Textarea } from "@/components/Fields";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/Pill";
import { Table } from "@/components/Table";
import { useToast } from "@/components/Toast";
import { useAsync } from "@/hooks/useAsync";
import { useDepartments } from "@/hooks/useReference";
import { ApiError, api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { Job, JobInput, JobStatus } from "@/lib/types";

const blank: JobInput = { title: "", departmentId: null, headcount: 1, status: "draft", location: "Nairobi", description: "", closingDate: null };

export default function JobsPage() {
  const toast = useToast();
  const departments = useDepartments();
  const list = useAsync(() => api.jobs.list(), []);
  const [edit, setEdit] = useState<{ id?: number; d: JobInput } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const openEdit = (j?: Job) => {
    setErrs({});
    setEdit(j ? { id: j.id, d: { title: j.title, departmentId: j.departmentId, headcount: j.headcount, status: j.status, location: j.location, description: j.description, closingDate: j.closingDate } } : { d: blank });
  };
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      if (edit.id) await api.jobs.update(edit.id, edit.d);
      else await api.jobs.create(edit.d);
      toast.success("Job position saved");
      setEdit(null);
      list.reload();
    } catch (e) {
      setErrs(e instanceof ApiError ? e.fields : { title: "Could not save" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Job positions" actions={<Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => openEdit()}>New position</Button>} />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <Table
          caption="Job positions"
          loading={list.loading && !list.data}
          rows={list.data ?? []}
          rowKey={(j) => j.id}
          empty={<EmptyState title="No job positions yet" text="Create a position to start receiving applications." />}
          columns={[
            { key: "t", header: "Position", render: (j) => <span className="font-semibold text-ink">{j.title}</span> },
            { key: "d", header: "Department", render: (j) => j.departmentName || <span className="text-muted">Not set</span> },
            { key: "h", header: "Openings", render: (j) => j.headcount },
            { key: "a", header: "Applicants", render: (j) => j.applicantCount },
            { key: "c", header: "Closes", render: (j) => fmtDate(j.closingDate) || <span className="text-muted">Open ended</span> },
            { key: "s", header: "Status", render: (j) => <StatusPill status={j.status} /> },
            { key: "e", header: "", render: (j) => <Button size="sm" variant="ghost" aria-label={`Edit ${j.title}`} icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => openEdit(j)} /> },
          ]}
        />
      )}
      <Modal open={!!edit} size="lg" title={edit?.id ? "Edit position" : "New position"} onClose={() => setEdit(null)} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
        {edit && (
          <div className="space-y-4">
            <Input label="Title" value={edit.d.title} onChange={(e) => setEdit({ ...edit, d: { ...edit.d, title: e.target.value } })} error={errs.title} required />
            <FormGrid>
              <Select label="Department" value={edit.d.departmentId ?? ""} onChange={(e) => setEdit({ ...edit, d: { ...edit.d, departmentId: e.target.value ? Number(e.target.value) : null } })}>
                <option value="">Not set</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <Select label="Status" value={edit.d.status} onChange={(e) => setEdit({ ...edit, d: { ...edit.d, status: e.target.value as JobStatus } })}>
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </Select>
              <Input label="Openings" type="number" min={1} value={edit.d.headcount} onChange={(e) => setEdit({ ...edit, d: { ...edit.d, headcount: Number(e.target.value) } })} error={errs.headcount} />
              <Input label="Location" value={edit.d.location} onChange={(e) => setEdit({ ...edit, d: { ...edit.d, location: e.target.value } })} />
              <Input label="Closing date" type="date" value={edit.d.closingDate ?? ""} onChange={(e) => setEdit({ ...edit, d: { ...edit.d, closingDate: e.target.value || null } })} error={errs.closingDate} />
            </FormGrid>
            <Textarea label="Description" rows={5} value={edit.d.description} onChange={(e) => setEdit({ ...edit, d: { ...edit.d, description: e.target.value } })} />
          </div>
        )}
      </Modal>
    </>
  );
}
