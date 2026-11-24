"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { Checkbox, FormGrid, Input, Select } from "@/components/Fields";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { Pill } from "@/components/Pill";
import { useToast } from "@/components/Toast";
import { useAsync } from "@/hooks/useAsync";
import { useReference } from "@/hooks/useReference";
import { ApiError, api } from "@/lib/api";
import { humanize } from "@/lib/format";
import type { TaskKind, TaskTemplate } from "@/lib/types";

type Draft = Omit<TaskTemplate, "id">;
const blank = (kind: TaskKind): Draft => ({ kind, title: "", ownerRole: "hr", offsetDays: 0, mandatory: true });

export default function TemplatesPage() {
  const toast = useToast();
  const ref = useReference();
  const list = useAsync(() => api.taskTemplates.list(), []);
  const [edit, setEdit] = useState<{ id?: number; d: Draft } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      if (edit.id) await api.taskTemplates.update(edit.id, edit.d);
      else await api.taskTemplates.create(edit.d);
      toast.success("Template saved");
      setEdit(null);
      setErrs({});
      list.reload();
    } catch (e) {
      setErrs(e instanceof ApiError ? { ...e.fields, ...(Object.keys(e.fields).length ? {} : { title: e.message }) } : { title: "Could not save" });
    } finally {
      setBusy(false);
    }
  };

  const section = (kind: TaskKind, title: string) => {
    const rows = (list.data ?? []).filter((t) => t.kind === kind);
    return (
      <Card
        title={title}
        action={<Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => { setErrs({}); setEdit({ d: blank(kind) }); }}>Add task</Button>}
      >
        {rows.length === 0 ? (
          <EmptyState title="No tasks in this checklist" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{t.title}</p>
                  <p className="text-sm text-muted">
                    {humanize(t.ownerRole)} · {t.offsetDays === 0 ? "on the day" : t.offsetDays > 0 ? `${t.offsetDays} days after` : `${-t.offsetDays} days before`}
                  </p>
                </div>
                {t.mandatory && <Pill tone="info">Mandatory</Pill>}
                <Button size="sm" variant="ghost" aria-label={`Edit ${t.title}`} icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => { setErrs({}); setEdit({ id: t.id, d: { kind: t.kind, title: t.title, ownerRole: t.ownerRole, offsetDays: t.offsetDays, mandatory: t.mandatory } }); }} />
                <Button size="sm" variant="danger" aria-label={`Delete ${t.title}`} icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={async () => { if (window.confirm(`Delete "${t.title}"? Tasks already created are kept.`) && (await toast.run(api.taskTemplates.remove(t.id), "Template deleted"))) list.reload(); }} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  };

  return (
    <>
      <PageHeader title="Task templates" subtitle="The checklists created automatically when someone is hired or starts their exit. Changes apply to future employees only." />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {section("onboarding", "Onboarding")}
          {section("offboarding", "Offboarding (exit)")}
        </div>
      )}
      <Modal
        open={!!edit}
        title={edit?.id ? "Edit task template" : "New task template"}
        onClose={() => setEdit(null)}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}
      >
        {edit && (
          <div className="space-y-4">
            <Input label="Task" value={edit.d.title} onChange={(e) => setEdit({ ...edit, d: { ...edit.d, title: e.target.value } })} error={errs.title} required />
            <FormGrid>
              <Select label="Owner" value={edit.d.ownerRole} onChange={(e) => setEdit({ ...edit, d: { ...edit.d, ownerRole: e.target.value as TaskTemplate["ownerRole"] } })}>
                {ref.ownerRoles.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
              </Select>
              <Input label="Due (days from start or exit)" type="number" value={edit.d.offsetDays} onChange={(e) => setEdit({ ...edit, d: { ...edit.d, offsetDays: Number(e.target.value) } })} error={errs.offsetDays} hint="Negative means before." />
            </FormGrid>
            <Checkbox label="Mandatory" hint="Mandatory exit tasks must be done before an employee can be marked as exited." checked={edit.d.mandatory} onChange={(e) => setEdit({ ...edit, d: { ...edit.d, mandatory: e.target.checked } })} />
          </div>
        )}
      </Modal>
    </>
  );
}
