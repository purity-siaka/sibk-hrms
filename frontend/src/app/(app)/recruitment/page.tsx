"use client";

import { useRouter } from "next/navigation";
import { Plus, Star } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/EmptyState";
import { FormGrid, Input, Select, Textarea, FilterSelect } from "@/components/Fields";
import { DOC_ACCEPT, DOC_MAX, FileDrop } from "@/components/FileDrop";
import { Modal } from "@/components/Modal";
import { FilterBar, PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/Pill";
import { BlockSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { useAsync } from "@/hooks/useAsync";
import { useDepartments, useReference } from "@/hooks/useReference";
import { ApiError, api } from "@/lib/api";
import { fmtDate, fmtDateTime, humanize, todayISO } from "@/lib/format";
import type { Applicant, ApplicantStage, EmploymentType } from "@/lib/types";

function Stars({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="inline-flex" aria-label={`${n} out of 5`}>
      {Array.from({ length: n }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-gold text-gold" aria-hidden />
      ))}
    </span>
  );
}

export default function RecruitmentPage() {
  const router = useRouter();
  const toast = useToast();
  const ref = useReference();
  const departments = useDepartments();
  const [jobId, setJobId] = useState("");
  const jobs = useAsync(() => api.jobs.list(), []);
  const apps = useAsync(() => api.applicants.list({ jobId }), [jobId]);
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<Applicant | null>(null);
  const [hiring, setHiring] = useState(false);

  const [form, setForm] = useState({ fullName: "", email: "", phone: "", jobId: "", source: "", notes: "" });
  const [cv, setCv] = useState<File | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const interviews = useAsync(() => (sel ? api.applicants.interviews(sel.id) : Promise.resolve([])), [sel?.id]);
  const [iv, setIv] = useState({ scheduledAt: "", mode: "In person", panel: "", score: "" });
  const [hire, setHire] = useState({ startDate: todayISO(), employmentType: "permanent" as EmploymentType, departmentId: "", jobTitle: "" });
  const [note, setNote] = useState("");

  const stages = ref.applicantStages;
  const byStage = (s: ApplicantStage) => (apps.data ?? []).filter((a) => a.stage === s);

  const create = async () => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = "Name is required.";
    if (!form.jobId) e.jobId = "Choose a position.";
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api.applicants.create({ ...form, jobId: Number(form.jobId) }, cv);
      toast.success("Applicant added");
      setAdding(false);
      setForm({ fullName: "", email: "", phone: "", jobId: "", source: "", notes: "" });
      setCv(null);
      apps.reload();
    } catch (err) {
      setErrs(err instanceof ApiError ? err.fields : { fullName: "Could not save" });
    } finally {
      setBusy(false);
    }
  };

  const move = async (a: Applicant, stage: ApplicantStage) => {
    const updated = await toast.run(api.applicants.setStage(a.id, stage, note || undefined), `Moved to ${humanize(stage)}`);
    if (updated) {
      setSel(updated);
      setNote("");
      apps.reload();
    }
  };

  return (
    <>
      <PageHeader title="Applications" subtitle="Recruitment records are kept for at least 6 years, so rejected applicants stay on file." actions={<Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setAdding(true)}>New applicant</Button>} />
      <FilterBar>
        <FilterSelect label="Job position" value={jobId} onChange={setJobId}>
          <option value="">All positions</option>
          {(jobs.data ?? []).map((j) => (
            <option key={j.id} value={j.id}>{j.title}</option>
          ))}
        </FilterSelect>
      </FilterBar>

      {apps.error ? (
        <ErrorState error={apps.error} onRetry={apps.reload} />
      ) : apps.loading && !apps.data ? (
        <BlockSkeleton lines={6} />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-3" role="list" aria-label="Recruitment pipeline">
          {stages.map((s) => {
            const items = byStage(s);
            return (
              <section key={s} role="listitem" aria-label={humanize(s)} className="w-[270px] shrink-0">
                <header className="mb-2 flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-card">
                  <h2 className="text-sm font-bold text-navy">{humanize(s)}</h2>
                  <span className="rounded-full bg-gold-soft px-2 text-xs font-bold text-gold-deep">{items.length}</span>
                </header>
                <ul className="space-y-2">
                  {items.map((a) => (
                    <li key={a.id}>
                      <button onClick={() => { setSel(a); setNote(""); }} className="w-full rounded-[12px] border border-line bg-white p-3 text-left shadow-card transition-shadow hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
                        <p className="font-semibold text-ink">{a.fullName}</p>
                        <p className="mt-0.5 truncate text-sm text-muted">{a.jobTitle}</p>
                        <div className="mt-2 flex items-center justify-between text-xs text-muted">
                          <Stars n={a.rating} />
                          <span>{fmtDate(a.stageChangedAt)}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                  {items.length === 0 && <li className="rounded-[12px] border border-dashed border-[#C5CEEA] p-3 text-center text-xs text-muted">No applicants</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Modal open={adding} title="New applicant" onClose={() => setAdding(false)} footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button loading={busy} onClick={create}>Add applicant</Button></>}>
        <div className="space-y-4">
          <FormGrid>
            <Input label="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} error={errs.fullName} required />
            <Select label="Position" value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })} error={errs.jobId} required>
              <option value="">Choose a position</option>
              {(jobs.data ?? []).filter((j) => j.status !== "closed").map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </Select>
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errs.email} />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} hint="For example LinkedIn, referral, careers page." />
          </FormGrid>
          <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <FileDrop label="CV (optional)" file={cv} onChange={setCv} accept={DOC_ACCEPT} maxBytes={DOC_MAX} hint="PDF, JPG, PNG or DOCX, up to 10 MB" error={errs.file} />
        </div>
      </Modal>

      <Modal open={!!sel} side title={sel?.fullName ?? ""} onClose={() => setSel(null)}>
        {sel && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={sel.stage} />
              <Stars n={sel.rating} />
              <span className="text-sm text-muted">{sel.jobTitle}</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs font-semibold uppercase text-muted">Email</dt><dd>{sel.email || "n/a"}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-muted">Phone</dt><dd>{sel.phone || "n/a"}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-muted">Source</dt><dd>{sel.source || "n/a"}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-muted">Applied</dt><dd>{fmtDate(sel.createdAt)}</dd></div>
            </dl>
            {sel.hasCv && <Button variant="ghost" size="sm" onClick={() => void toast.run(api.applicants.downloadCv(sel.id, sel.fullName), "Download started")}>Download CV</Button>}
            {sel.notes && <pre className="whitespace-pre-wrap rounded-[10px] bg-[#F8F9FD] p-3 font-sans text-sm text-ink">{sel.notes}</pre>}

            {sel.stage !== "hired" && (
              <div className="space-y-3 rounded-[12px] border border-line p-3">
                <Select label="Move to stage" value={sel.stage} onChange={(e) => void move(sel, e.target.value as ApplicantStage)}>
                  {stages.filter((s) => s !== "hired").map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                </Select>
                <Input label="Note for this move (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                {sel.stage !== "rejected" && <Button variant="gold" onClick={() => { setHire({ ...hire, jobTitle: sel.jobTitle }); setHiring(true); }}>Hire this applicant</Button>}
              </div>
            )}
            {sel.employeeId && <Button onClick={() => router.push(`/employees/${sel.employeeId}`)}>Open employee record</Button>}

            <div>
              <h3 className="mb-2 text-sm font-bold text-navy">Interviews</h3>
              {(interviews.data ?? []).length === 0 ? <p className="text-sm text-muted">None scheduled.</p> : (
                <ul className="space-y-2">
                  {(interviews.data ?? []).map((i) => (
                    <li key={i.id} className="rounded-[10px] bg-[#F8F9FD] p-3 text-sm">
                      <p className="font-semibold">{fmtDateTime(i.scheduledAt)} · {i.mode}</p>
                      <p className="text-muted">{i.panel}{i.score ? ` · score ${i.score}/10` : ""}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 space-y-3 rounded-[12px] border border-line p-3">
                <Input label="Date and time" type="datetime-local" value={iv.scheduledAt} onChange={(e) => setIv({ ...iv, scheduledAt: e.target.value })} />
                <FormGrid>
                  <Input label="Mode" value={iv.mode} onChange={(e) => setIv({ ...iv, mode: e.target.value })} />
                  <Input label="Score (0 to 10)" type="number" min={0} max={10} value={iv.score} onChange={(e) => setIv({ ...iv, score: e.target.value })} />
                </FormGrid>
                <Input label="Panel" value={iv.panel} onChange={(e) => setIv({ ...iv, panel: e.target.value })} />
                <Button size="sm" disabled={!iv.scheduledAt} onClick={async () => {
                  const when = new Date(iv.scheduledAt).toISOString();
                  if (await toast.run(api.applicants.addInterview(sel.id, { scheduledAt: when, mode: iv.mode, panel: iv.panel, score: iv.score ? Number(iv.score) : 0 }), "Interview saved")) {
                    setIv({ scheduledAt: "", mode: "In person", panel: "", score: "" });
                    interviews.reload();
                  }
                }}>Save interview</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={hiring && !!sel} title={`Hire ${sel?.fullName ?? ""}`} onClose={() => setHiring(false)} footer={<><Button variant="ghost" onClick={() => setHiring(false)}>Cancel</Button><Button variant="gold" onClick={async () => {
        if (!sel) return;
        const e = await toast.run(api.applicants.hire(sel.id, { startDate: hire.startDate, employmentType: hire.employmentType, jobTitle: hire.jobTitle || undefined, departmentId: hire.departmentId ? Number(hire.departmentId) : undefined }), "Employee record created");
        if (e) { setHiring(false); setSel(null); router.push(`/employees/${e.id}`); }
      }}>Create employee</Button></>}>
        <p className="mb-3 text-sm text-muted">This creates the employee record on probation and the onboarding checklist. The applicant stays on file.</p>
        <div className="space-y-4">
          <Input label="Start date" type="date" value={hire.startDate} onChange={(e) => setHire({ ...hire, startDate: e.target.value })} required />
          <Input label="Job title" value={hire.jobTitle} onChange={(e) => setHire({ ...hire, jobTitle: e.target.value })} />
          <FormGrid>
            <Select label="Employment type" value={hire.employmentType} onChange={(e) => setHire({ ...hire, employmentType: e.target.value as EmploymentType })}>
              {ref.employmentTypes.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </Select>
            <Select label="Department" value={hire.departmentId} onChange={(e) => setHire({ ...hire, departmentId: e.target.value })}>
              <option value="">From the job position</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </FormGrid>
        </div>
      </Modal>
    </>
  );
}
