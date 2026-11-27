"use client";

import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { api, ApiError } from "@/lib/api";
import { fmtDate, humanize } from "@/lib/format";
import type { OwnerRole, Task, TaskKind } from "@/lib/types";
import { Button } from "./Button";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { FormGrid, Input, Select, Textarea } from "./Fields";
import { Modal } from "./Modal";
import { StatusPill } from "./Pill";
import { useToast } from "./Toast";

const OWNERS: OwnerRole[] = ["hr", "it", "finance", "line_manager"];

interface Draft {
  employeeId: string;
  title: string;
  ownerRole: OwnerRole;
  dueDate: string;
  notes: string;
}
const BLANK: Draft = { employeeId: "", title: "", ownerRole: "hr", dueDate: "", notes: "" };

/** Add or edit one onboarding / offboarding task. HR chooses who the task is for. */
export function TaskFormModal({ open, kind, initial, employeeId, onClose, onSaved }: { open: boolean; kind: TaskKind; initial: Task | null; employeeId?: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const people = useAsync(() => (open && !employeeId ? api.employees.list({ pageSize: 100 }) : Promise.resolve({ items: [], total: 0 })), [open, employeeId]);
  const [d, setD] = useState<Draft>(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState("");
  const key = open ? String(initial?.id ?? "new") : "";
  if (key !== seen) {
    setSeen(key);
    if (open) {
      setD(initial ? { employeeId: String(initial.employeeId), title: initial.title, ownerRole: initial.ownerRole, dueDate: initial.dueDate ?? "", notes: initial.notes } : { ...BLANK, employeeId: employeeId ? String(employeeId) : "" });
      setErrors({});
    }
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const ready = d.title.trim() !== "" && d.employeeId !== "";
  const save = async () => {
    setBusy(true);
    try {
      if (initial) await api.tasks.update(initial.id, { employeeId: Number(d.employeeId), title: d.title, ownerRole: d.ownerRole, dueDate: d.dueDate, notes: d.notes });
      else await api.tasks.create({ employeeId: Number(d.employeeId), kind, title: d.title, ownerRole: d.ownerRole, dueDate: d.dueDate, notes: d.notes });
      toast.success(initial ? "Task updated" : "Task added");
      onSaved();
      onClose();
    } catch (e) {
      setErrors(e instanceof ApiError ? { ...e.fields, ...(Object.keys(e.fields).length ? {} : { title: e.message }) } : { title: "Could not save" });
    } finally {
      setBusy(false);
    }
  };
  const label = kind === "onboarding" ? "onboarding" : "offboarding";
  return (
    <Modal
      open={open}
      title={initial ? `Edit ${label} task` : `Add ${label} task`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!ready} onClick={save}>{initial ? "Save changes" : "Add task"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select label="Assigned to (employee)" value={d.employeeId} onChange={(e) => set("employeeId", e.target.value)} error={errors.employeeId} disabled={!!employeeId} required>
          <option value="">Choose an employee</option>
          {employeeId && initial === null && <option value={employeeId}>This employee</option>}
          {(people.data?.items ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.fullName}</option>
          ))}
        </Select>
        <Input label="Task" value={d.title} onChange={(e) => set("title", e.target.value)} error={errors.title} hint="For example: Issue laptop" required />
        <FormGrid>
          <Select label="Responsible" value={d.ownerRole} onChange={(e) => set("ownerRole", e.target.value as OwnerRole)} error={errors.ownerRole}>
            {OWNERS.map((o) => (
              <option key={o} value={o}>{humanize(o)}</option>
            ))}
          </Select>
          <Input label="Due date (optional)" type="date" value={d.dueDate} onChange={(e) => set("dueDate", e.target.value)} error={errors.dueDate} />
        </FormGrid>
        <Textarea label="Notes (optional)" value={d.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
    </Modal>
  );
}

/** A card list of tasks with mark done, edit (pencil) and delete (trash). HR only for edit and delete. */
export function TaskCards({ tasks, kind, hr, canMark, onChange, employeeId, showEmployee, emptyText }: { tasks: Task[]; kind: TaskKind | null; hr: boolean; canMark: boolean; onChange: () => void; employeeId?: number; showEmployee?: boolean; emptyText?: string }) {
  const toast = useToast();
  const [form, setForm] = useState<{ open: boolean; kind: TaskKind; t: Task | null }>({ open: false, kind: "onboarding", t: null });
  const today = new Date().toISOString().slice(0, 10);
  const mark = async (t: Task, status: Task["status"]) => {
    if (await toast.run(api.tasks.update(t.id, { status }), "Task updated")) onChange();
  };
  const kinds: TaskKind[] = kind ? [kind] : ["onboarding", "offboarding"];
  return (
    <>
      {hr && (
        <div className="flex flex-wrap justify-end gap-2">
          {kinds.map((k) => (
            <Button key={k} icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setForm({ open: true, kind: k, t: null })}>
              Add {k} task
            </Button>
          ))}
        </div>
      )}
      {tasks.length === 0 ? (
        <EmptyState title="No tasks" text={emptyText ?? (hr ? "Use the Add task button to create one." : "Nothing here yet.")} />
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => (
            <li key={t.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-ink">{t.title}</p>
                    <p className="text-sm text-muted">
                      Assigned to{" "}
                      {showEmployee ? (
                        <Link className="font-semibold text-navy hover:underline" href={`/employees/${t.employeeId}`}>{t.employeeName}</Link>
                      ) : (
                        <strong className="text-ink">{t.employeeName}</strong>
                      )}
                      {" · "}
                      {!kind && `${humanize(t.kind)} · `}
                      Responsible: {humanize(t.ownerRole)}
                      {" · "}
                      <span className={t.dueDate && t.dueDate < today && t.status !== "done" ? "font-semibold text-danger" : ""}>due {fmtDate(t.dueDate) || "n/a"}</span>
                      {t.completedByName && ` · done by ${t.completedByName}`}
                    </p>
                    {t.notes && <p className="mt-1 text-sm text-ink">{t.notes}</p>}
                  </div>
                  <StatusPill status={t.status} />
                  {canMark &&
                    (t.status === "done" ? (
                      <Button size="sm" variant="quiet" onClick={() => mark(t, "pending")}>Reopen</Button>
                    ) : (
                      <Button size="sm" onClick={() => mark(t, "done")}>Mark done</Button>
                    ))}
                  {hr && (
                    <>
                      <Button size="sm" variant="ghost" aria-label={`Edit ${t.title}`} icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setForm({ open: true, kind: t.kind, t })} />
                      <Button
                        size="sm"
                        variant="danger"
                        aria-label={`Delete ${t.title}`}
                        icon={<Trash2 className="h-4 w-4" aria-hidden />}
                        onClick={async () => {
                          if (window.confirm(`Delete the task "${t.title}"?`) && (await toast.run(api.tasks.remove(t.id), "Task deleted"))) onChange();
                        }}
                      />
                    </>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <TaskFormModal open={form.open} kind={form.kind} initial={form.t} employeeId={employeeId} onClose={() => setForm((f) => ({ ...f, open: false }))} onSaved={onChange} />
    </>
  );
}
