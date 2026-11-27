"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { api, ApiError } from "@/lib/api";
import type { SignOff } from "@/lib/types";
import { Button } from "./Button";
import { FormGrid, Input, Select } from "./Fields";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

const STATUSES = ["Draft", "Under review", "Approved", "Final"];
const CLASSES = ["Internal", "Confidential", "Restricted", "Public"];

interface Draft {
  title: string;
  processName: string;
  processId: string;
  processDepartment: string;
  processOwner: string;
  processManager: string;
  version: string;
  effectiveDate: string;
  reviewDate: string;
  documentStatus: string;
  classification: string;
  categoryDepartmentId: string;
}
const BLANK: Draft = { title: "", processName: "", processId: "", processDepartment: "", processOwner: "", processManager: "", version: "1.0", effectiveDate: "", reviewDate: "", documentStatus: "Draft", classification: "Internal", categoryDepartmentId: "" };

interface Signer {
  email: string;
  name: string;
  label: string;
}

/** Start a sign-off, or (with `again`) correct a returned one and send it round again. */
export function NewSignOffModal({ open, again, onClose, onSaved }: { open: boolean; again?: SignOff | null; onClose: () => void; onSaved: (s: SignOff) => void }) {
  const toast = useToast();
  const people = useAsync(() => (open ? api.signoffs.signers() : Promise.resolve([])), [open]);
  const depts = useAsync(() => (open ? api.departments.list() : Promise.resolve([])), [open]);
  const [d, setD] = useState<Draft>(BLANK);
  const [file, setFile] = useState<File | null>(null);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [pick, setPick] = useState("");
  const [label, setLabel] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState("");
  const key = open ? String(again?.id ?? "new") : "";
  if (key !== seen) {
    setSeen(key);
    if (open) {
      setErrors({});
      setFile(null);
      setPick("");
      setLabel("");
      if (again) {
        setD({ title: again.title, processName: again.processName, processId: again.processId, processDepartment: again.processDepartment, processOwner: again.processOwner, processManager: again.processManager, version: again.version, effectiveDate: again.effectiveDate ?? "", reviewDate: again.reviewDate ?? "", documentStatus: again.documentStatus, classification: again.classification, categoryDepartmentId: again.categoryDepartmentId ? String(again.categoryDepartmentId) : "" });
        setSigners(again.steps.map((s) => ({ email: s.email, name: s.name, label: s.label })));
      } else {
        setD(BLANK);
        setSigners([]);
      }
    }
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const move = (i: number, by: number) =>
    setSigners((l) => {
      const j = i + by;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const add = () => {
    const p = (people.data ?? []).find((x) => x.email === pick);
    if (!p || signers.some((s) => s.email === p.email)) return;
    setSigners((l) => [...l, { email: p.email, name: p.name, label: label.trim() }]);
    setPick("");
    setLabel("");
  };
  const ready = d.title.trim() !== "" && d.categoryDepartmentId !== "" && signers.length > 0 && (!!again || file !== null);
  const save = async () => {
    setBusy(true);
    try {
      const f = new FormData();
      Object.entries(d).forEach(([k, v]) => f.append(k, v));
      f.append("signers", JSON.stringify(signers.map((s) => ({ email: s.email, label: s.label }))));
      if (file) f.append("file", file);
      const res = again ? await api.signoffs.resubmit(again.id, f) : await api.signoffs.create(f);
      toast.success(again ? "Sent again from number 1" : `Sent to ${signers[0].name} to sign`);
      onSaved(res);
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
      title={again ? `Correct and send again: ${again.title}` : "New sign-off"}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!ready} onClick={save}>{again ? "Send again" : "Send for signing"}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label htmlFor="so-file" className="text-[13px] font-semibold text-ink">
            {again ? "Corrected document (optional, PDF, JPG or PNG)" : "Document to be signed (PDF, JPG or PNG, up to 15 MB)"}
          </label>
          <input
            id="so-file"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="mt-1 block w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !d.title.trim()) set("title", f.name.replace(/\.[^.]+$/, ""));
            }}
          />
          {errors.file && <p className="mt-1 text-xs text-danger">{errors.file}</p>}
        </div>

        <fieldset className="space-y-3 rounded-[12px] border border-line p-4">
          <legend className="px-1 text-sm font-bold text-navy">Document details</legend>
          <FormGrid>
            <Input label="Document name" value={d.title} onChange={(e) => set("title", e.target.value)} error={errors.title} required />
            <Select label="Category (department)" value={d.categoryDepartmentId} onChange={(e) => set("categoryDepartmentId", e.target.value)} error={errors.categoryDepartmentId} required>
              <option value="">Choose a department</option>
              {(depts.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </Select>
            <Input label="Process name" value={d.processName} onChange={(e) => set("processName", e.target.value)} />
            <Input label="Process ID" value={d.processId} onChange={(e) => set("processId", e.target.value)} hint="For example FM-PFM-001 (Flowchart 1.2)" />
            <Input label="Department" value={d.processDepartment} onChange={(e) => set("processDepartment", e.target.value)} />
            <Input label="Process owner" value={d.processOwner} onChange={(e) => set("processOwner", e.target.value)} />
            <Input label="Process manager" value={d.processManager} onChange={(e) => set("processManager", e.target.value)} />
            <Input label="Version" value={d.version} onChange={(e) => set("version", e.target.value)} />
            <Input label="Effective date" type="date" value={d.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} error={errors.effectiveDate} />
            <Input label="Review date" type="date" value={d.reviewDate} onChange={(e) => set("reviewDate", e.target.value)} error={errors.reviewDate} />
            <Select label="Document status" value={d.documentStatus} onChange={(e) => set("documentStatus", e.target.value)}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </Select>
            <Select label="Classification" value={d.classification} onChange={(e) => set("classification", e.target.value)}>
              {CLASSES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </FormGrid>
        </fieldset>

        <fieldset className="space-y-3 rounded-[12px] border border-line p-4">
          <legend className="px-1 text-sm font-bold text-navy">Who signs, in order</legend>
          <p className="text-sm text-muted">Number 1 signs first. When they sign, it moves to number 2, and so on. You may include yourself.</p>
          {signers.length > 0 && (
            <ol className="space-y-2">
              {signers.map((s, i) => (
                <li key={s.email} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-bg px-3 py-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    <strong className="text-ink">{s.name}</strong> <span className="text-muted">{s.email}</span>
                    {s.label && <span className="ml-2 rounded-full bg-blue-soft px-2 py-0.5 text-xs font-semibold text-navy">{s.label}</span>}
                  </span>
                  <Button size="sm" variant="quiet" aria-label="Move up" disabled={i === 0} icon={<ArrowUp className="h-4 w-4" aria-hidden />} onClick={() => move(i, -1)} />
                  <Button size="sm" variant="quiet" aria-label="Move down" disabled={i === signers.length - 1} icon={<ArrowDown className="h-4 w-4" aria-hidden />} onClick={() => move(i, 1)} />
                  <Button size="sm" variant="danger" aria-label={`Remove ${s.name}`} icon={<X className="h-4 w-4" aria-hidden />} onClick={() => setSigners((l) => l.filter((_, j) => j !== i))} />
                </li>
              ))}
            </ol>
          )}
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_180px_auto]">
            <Select label="Add a signatory (Salaam email)" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose a person</option>
              {(people.data ?? []).filter((p) => !signers.some((s) => s.email === p.email)).map((p) => (
                <option key={p.email} value={p.email}>{p.name} ({p.email})</option>
              ))}
            </Select>
            <Input label="Role (optional)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Reviewed by" />
            <Button variant="ghost" disabled={!pick} icon={<Plus className="h-4 w-4" aria-hidden />} onClick={add}>Add</Button>
          </div>
          {errors.signers && <p className="text-xs text-danger">{errors.signers}</p>}
        </fieldset>
      </div>
    </Modal>
  );
}
