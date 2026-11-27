"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { isHR } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import type { Sponsorship, Training, TrainingInput, TrainingStatus } from "@/lib/types";
import { Button } from "./Button";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { FormGrid, Input, Select, Textarea } from "./Fields";
import { Modal } from "./Modal";
import { Pill } from "./Pill";
import { useToast } from "./Toast";

export const sponsorLabel = (s: Sponsorship) => (s === "sibk" ? "SIBK-sponsored" : "Self-sponsored");
const STATUS_LABEL: Record<TrainingStatus, string> = { upcoming: "Upcoming", ongoing: "Ongoing", completed: "Completed", cancelled: "Cancelled" };
const STATUS_TONE: Record<TrainingStatus, "info" | "wait" | "ok" | "neutral"> = { upcoming: "info", ongoing: "wait", completed: "ok", cancelled: "neutral" };
const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

export function SponsorPill({ s }: { s: Sponsorship }) {
  return <Pill tone={s === "sibk" ? "ok" : "neutral"}>{sponsorLabel(s)}</Pill>;
}

const BLANK: TrainingInput = { title: "", provider: "", startDate: "", endDate: "", sponsorship: "self", notes: "" };

/** Add or edit a training. The Save button stays disabled until the required fields are filled. */
function TrainingForm({ open, initial, onClose, onSaved }: { open: boolean; initial: Training | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<TrainingInput>(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<string>("");
  const key = open ? `${initial?.id ?? "new"}` : "";
  if (key !== seen) {
    setSeen(key);
    if (open) {
      setD(initial ? { title: initial.title, provider: initial.provider, startDate: initial.startDate, endDate: initial.endDate ?? "", sponsorship: initial.sponsorship, notes: initial.notes } : BLANK);
      setErrors({});
    }
  }
  const set = <K extends keyof TrainingInput>(k: K, v: TrainingInput[K]) => setD((x) => ({ ...x, [k]: v }));
  const ready = d.title.trim() !== "" && d.startDate !== "" && (!d.endDate || d.endDate >= d.startDate);
  const save = async () => {
    setBusy(true);
    try {
      if (initial) await api.training.update(initial.id, d);
      else await api.training.create(d);
      toast.success(initial ? "Training updated" : "Training added");
      onSaved();
      onClose();
    } catch (e) {
      setErrors(e instanceof ApiError ? { ...e.fields, ...(Object.keys(e.fields).length ? {} : { title: e.message }) } : { title: "Could not save" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      title={initial ? "Edit training" : "Upcoming training"}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!ready} onClick={save}>{initial ? "Save changes" : "Add training"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormGrid>
          <Input label="Training name" value={d.title} onChange={(e) => set("title", e.target.value)} error={errors.title} required />
          <Input label="Provider or venue" value={d.provider} onChange={(e) => set("provider", e.target.value)} hint="For example the institution and town." />
          <Input label="Starts on" type="date" value={d.startDate} onChange={(e) => set("startDate", e.target.value)} error={errors.startDate} required />
          <Input label="Ends on (optional)" type="date" value={d.endDate} min={d.startDate || undefined} onChange={(e) => set("endDate", e.target.value)} error={errors.endDate} />
        </FormGrid>
        <Select label="Who is paying?" value={d.sponsorship} onChange={(e) => set("sponsorship", e.target.value as Sponsorship)} error={errors.sponsorship} required>
          <option value="self">Self-sponsored (I am paying)</option>
          <option value="sibk">Sponsored by SIBK</option>
        </Select>
        <Textarea label="Why this training? (optional)" value={d.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
    </Modal>
  );
}

/** A progress update. Every update says who is sponsoring at that point. */
function UpdateForm({ t, onClose, onSaved }: { t: Training | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [sponsorship, setSponsorship] = useState<Sponsorship>("self");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<TrainingStatus>("upcoming");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<number | null>(null);
  if ((t?.id ?? null) !== seen) {
    setSeen(t?.id ?? null);
    if (t) {
      setNote("");
      setSponsorship(t.sponsorship);
      setAmount("");
      setStatus(t.status);
      setErrors({});
    }
  }
  const amt = amount.trim() === "" ? undefined : Number(amount);
  const ready = note.trim() !== "" && (amt === undefined || (!Number.isNaN(amt) && amt >= 0));
  const save = async () => {
    if (!t) return;
    setBusy(true);
    try {
      await api.training.addUpdate(t.id, { note, sponsorship, amount: amt, status });
      toast.success("Update added");
      onSaved();
      onClose();
    } catch (e) {
      setErrors(e instanceof ApiError ? { ...e.fields, ...(Object.keys(e.fields).length ? {} : { note: e.message }) } : { note: "Could not save" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={t !== null}
      title={t ? `Update: ${t.title}` : "Update"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!ready} onClick={save}>Add update</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Textarea label="What is the update?" value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} required />
        <FormGrid>
          <Select label="Who is sponsoring this?" value={sponsorship} onChange={(e) => setSponsorship(e.target.value as Sponsorship)} error={errors.sponsorship} required>
            <option value="self">Self-sponsored</option>
            <option value="sibk">Sponsored by SIBK</option>
          </Select>
          <Select label="Training status" value={status} onChange={(e) => setStatus(e.target.value as TrainingStatus)}>
            {(Object.keys(STATUS_LABEL) as TrainingStatus[]).map((k) => (
              <option key={k} value={k}>{STATUS_LABEL[k]}</option>
            ))}
          </Select>
        </FormGrid>
        <Input label="Amount paid so far (KES, optional)" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} hint="Helps SIBK see how much is being put into your growth." />
      </div>
    </Modal>
  );
}

/** The trainings of one person (or, with showEmployee, of many) with their updates. */
export function TrainingPanel({ items, onChange, canAdd, showEmployee, emptyText }: { items: Training[]; onChange: () => void; canAdd?: boolean; showEmployee?: boolean; emptyText?: string }) {
  const { user } = useAuth();
  const hr = isHR(user);
  const toast = useToast();
  const [form, setForm] = useState<{ open: boolean; t: Training | null }>({ open: false, t: null });
  const [upd, setUpd] = useState<Training | null>(null);
  return (
    <>
      {canAdd && (
        <div className="flex justify-end">
          <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setForm({ open: true, t: null })}>
            Upcoming training
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState title="No training yet" text={emptyText ?? "Trainings you plan to attend will appear here."} />
      ) : (
        <ul className="space-y-3">
          {items.map((t) => (
            <li key={t.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-ink">{t.title}</p>
                    {showEmployee && <p className="text-sm font-semibold text-navy">{t.employeeName}</p>}
                    <p className="text-sm text-muted">
                      {t.provider && `${t.provider} · `}
                      {fmtDate(t.startDate)}
                      {t.endDate && ` to ${fmtDate(t.endDate)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Pill>
                    <SponsorPill s={t.sponsorship} />
                    {t.canEdit && (
                      <>
                        <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setUpd(t)}>Add update</Button>
                        <Button size="sm" variant="ghost" aria-label={`Edit ${t.title}`} icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setForm({ open: true, t })} />
                      </>
                    )}
                    {hr && (
                      <Button
                        size="sm"
                        variant="danger"
                        aria-label={`Delete ${t.title}`}
                        icon={<Trash2 className="h-4 w-4" aria-hidden />}
                        onClick={async () => {
                          if (window.confirm(`Delete "${t.title}" and all its updates?`) && (await toast.run(api.training.remove(t.id), "Training deleted"))) onChange();
                        }}
                      />
                    )}
                  </div>
                </div>
                {(t.sibkAmount > 0 || t.selfAmount > 0) && (
                  <p className="mt-2 text-sm text-muted">
                    Paid so far: SIBK <strong className="text-ink">{kes(t.sibkAmount)}</strong> · Self <strong className="text-ink">{kes(t.selfAmount)}</strong>
                  </p>
                )}
                {t.notes && <p className="mt-2 text-sm text-ink">{t.notes}</p>}
                {t.updates.length > 0 && (
                  <ol className="mt-3 space-y-2 border-l-2 border-line pl-4">
                    {t.updates.map((u) => (
                      <li key={u.id} className="text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted">{fmtDateTime(u.createdAt)}{u.byName && ` · ${u.byName}`}</span>
                          <SponsorPill s={u.sponsorship} />
                          {u.amount !== null && <span className="text-xs font-semibold text-ink">{kes(u.amount)}</span>}
                        </div>
                        <p className="whitespace-pre-wrap text-ink">{u.note}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <TrainingForm open={form.open} initial={form.t} onClose={() => setForm({ open: false, t: null })} onSaved={onChange} />
      <UpdateForm t={upd} onClose={() => setUpd(null)} onSaved={onChange} />
    </>
  );
}
