"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { FormGrid, Input, Select, Textarea } from "./Fields";
import { DOC_ACCEPT, DOC_MAX, FileDrop } from "./FileDrop";
import { Modal } from "./Modal";
import { useReference } from "@/hooks/useReference";
import { api, ApiError } from "@/lib/api";
import { todayISO } from "@/lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  /** HR records leave for this employee instead of for themself */
  employeeId?: number;
  employeeName?: string;
  availableDays?: number;
}

const EMPTY = { type: "annual", fromDate: "", toDate: "", reason: "" };

/** Leave application. A sick leave longer than 2 days offers a sick-note attachment. */
export function ApplyLeaveModal({ open, onClose, onDone, employeeId, employeeName, availableDays }: Props) {
  const ref = useReference();
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY);
      setFile(null);
      setErrors({});
      setFormError("");
      setDays(null);
    }
  }, [open]);

  useEffect(() => {
    setDays(null);
    if (!form.fromDate || !form.toDate || form.toDate < form.fromDate) return;
    let live = true;
    api.leave
      .calc(form.fromDate, form.toDate)
      .then((r) => {
        if (live) {
          setDays(r.days);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [form.fromDate, form.toDate]);

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const sickNote = form.type === "sick" && (days ?? 0) > 2;

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setFormError("");
    try {
      await api.leave.apply(form, sickNote ? file : null, employeeId);
      onDone();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else setFormError(e instanceof Error ? e.message : "Could not submit the request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={employeeName ? `Record leave for ${employeeName}` : "Apply for leave"}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit} disabled={!form.fromDate || !form.toDate || !form.reason.trim()}>
            Submit request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && (
          <p role="alert" className="rounded-[10px] border border-[#E7B7AF] bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}
        <FormGrid>
          <Select label="Leave type" value={form.type} onChange={(e) => set("type", e.target.value)} error={errors.type} required>
            {ref.leaveTypes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </Select>
          <div className="flex items-end text-sm text-muted">
            {form.type === "annual" && availableDays !== undefined && (
              <p>
                Available annual leave: <strong className="text-ink">{availableDays} days</strong>
              </p>
            )}
          </div>
          <Input label="From" type="date" value={form.fromDate} onChange={(e) => set("fromDate", e.target.value)} error={errors.fromDate} required />
          <Input label="To" type="date" value={form.toDate} min={form.fromDate || undefined} onChange={(e) => set("toDate", e.target.value)} error={errors.toDate} required />
        </FormGrid>
        {days !== null && (
          <p role="status" className="rounded-[10px] bg-blue-soft px-3 py-2 text-sm text-navy">
            <strong>{days} working {days === 1 ? "day" : "days"}</strong>
            {form.fromDate && form.fromDate < todayISO() && " This leave starts in the past."}
          </p>
        )}
        <Textarea label="Reason" value={form.reason} onChange={(e) => set("reason", e.target.value)} error={errors.reason} required />
        {sickNote && (
          <FileDrop
            label="Sick note (doctor's note or hospital slip)"
            file={file}
            onChange={setFile}
            accept={DOC_ACCEPT}
            maxBytes={DOC_MAX}
            hint="Sick leave of more than 2 days needs a sick note. You can also attach it later from your leave list."
            error={errors.file}
          />
        )}
      </div>
    </Modal>
  );
}
