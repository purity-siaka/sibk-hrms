"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Camera, Pencil, UserMinus } from "lucide-react";
import { useRef, useState } from "react";
import { AuthImage } from "@/components/AuthImage";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import { EmployeeForm } from "@/components/EmployeeForm";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { Input } from "@/components/Fields";
import { LeaveBalanceModal } from "@/components/LeaveBalanceModal";
import { LeavePanel } from "@/components/LeavePanel";
import { Modal } from "@/components/Modal";
import { StatusPill } from "@/components/Pill";
import { BlockSkeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { useToast } from "@/components/Toast";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { isHR } from "@/lib/access";
import { fmtDate, humanize, todayISO } from "@/lib/format";
import type { Employee, Task, TaskStatus } from "@/lib/types";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-[15px] text-ink">{value || <span className="text-muted">Not provided</span>}</dd>
    </div>
  );
}

function Hidden({ label }: { label: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm italic text-muted">Visible to HR only</dd>
    </div>
  );
}

function TaskList({ tasks, canEdit, onStatus }: { tasks: Task[]; canEdit: boolean; onStatus: (t: Task, s: TaskStatus) => void }) {
  if (tasks.length === 0) return <EmptyState title="No tasks yet" text="Tasks are created from the onboarding or offboarding templates." />;
  return (
    <ul className="divide-y divide-line rounded-[14px] border border-line bg-white shadow-card">
      {tasks.map((t) => (
        <li key={t.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{t.title}</p>
            <p className="text-sm text-muted">
              {humanize(t.kind)} · {humanize(t.ownerRole)} · due {fmtDate(t.dueDate) || "n/a"}
              {t.completedByName && ` · done by ${t.completedByName}`}
            </p>
          </div>
          <StatusPill status={t.status} />
          {canEdit && t.status !== "done" && (
            <Button size="sm" variant="ghost" onClick={() => onStatus(t, "done")}>
              Mark done
            </Button>
          )}
          {canEdit && t.status === "done" && (
            <Button size="sm" variant="quiet" onClick={() => onStatus(t, "pending")}>
              Reopen
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { user } = useAuth();
  const hr = isHR(user);
  const toast = useToast();
  const [tab, setTab] = useState("work");
  const [editing, setEditing] = useState(false);
  const [offboard, setOffboard] = useState(false);
  const [exitDate, setExitDate] = useState(todayISO());
  const [photoVersion, setPhotoVersion] = useState(0);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const emp = useAsync(() => api.employees.get(id), [id]);
  const team = useAsync(() => api.employees.directReports(id), [id]);
  const tasks = useAsync(() => api.employees.tasks(id), [id]);
  const leave = useAsync(() => api.leave.forEmployee(id), [id]);
  const docs = useAsync(() => (hr ? api.employees.checklist(id) : Promise.resolve([])), [id, hr]);
  const managers = useAsync(() => (hr ? api.employees.list({ pageSize: 100 }) : Promise.resolve({ items: [], total: 0 })), [hr]);

  if (emp.error) return <ErrorState error={emp.error} onRetry={emp.reload} />;
  if (emp.loading && !emp.data) return <BlockSkeleton lines={8} />;
  const e = emp.data as Employee;
  const sensitiveVisible = hr || e.id === user?.employeeId;
  const canManageTasks = hr || user?.role === "manager";

  const refreshAll = () => {
    emp.reload();
    tasks.reload();
    docs.reload();
  };
  const setTaskStatus = async (t: Task, status: TaskStatus) => {
    if (await toast.run(api.tasks.update(t.id, { status }), "Task updated")) tasks.reload();
  };
  const onPhoto = async (f?: File) => {
    if (!f) return;
    if (await toast.run(api.employees.uploadPhoto(e.id, f), "Photo updated")) setPhotoVersion((v) => v + 1);
    emp.reload();
  };

  const tabs = [
    { key: "work", label: "Work information" },
    { key: "private", label: "Private information" },
    ...(hr || e.id === user?.employeeId ? [{ key: "docs", label: "Documents", badge: e.documentsRequired ? `${e.documentsVerified ?? 0}/${e.documentsRequired}` : undefined }] : []),
    { key: "leave", label: "Leave", badge: leave.data?.balance.pendingDays ? `${leave.data.balance.pendingDays} pending` : undefined },
    { key: "tasks", label: "Onboarding and exit", badge: tasks.data?.filter((t) => t.status === "pending" || t.status === "in_progress").length || undefined },
    { key: "team", label: "Direct reports", badge: team.data?.length || undefined },
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/employees" className="font-semibold text-navy hover:underline">
          Employees
        </Link>{" "}
        / {e.fullName}
      </nav>

      <Card>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="relative shrink-0">
            <AuthImage employeeId={e.id} name={e.fullName} hasPhoto={e.hasPhoto} version={photoVersion} className="h-[132px] w-[106px] rounded-xl border border-line" textClass="text-3xl" />
            {(hr || e.id === user?.employeeId) && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  aria-label="Change photo"
                  className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-gold text-navy-dark shadow-card hover:bg-[#D8B25E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  <Camera className="h-4 w-4" aria-hidden />
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} onChange={(ev) => { void onPhoto(ev.target.files?.[0]); ev.target.value = ""; }} />
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-ink">{e.fullName}</h1>
              <StatusPill status={e.status} />
            </div>
            <p className="mt-1 text-base text-muted">{e.jobTitle}</p>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Employee no." value={e.employeeNo} />
              <Field label="Work email" value={e.email} />
              <Field label="Phone" value={e.phone} />
              <Field label="Department" value={e.departmentName} />
              <Field label="Manager" value={e.managerName} />
              <Field label="Start date" value={fmtDate(e.startDate)} />
            </dl>
          </div>
          {hr && (
            <div className="flex flex-wrap gap-2 sm:flex-col">
              <Button icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setEditing(true)}>
                Edit
              </Button>
              {e.status !== "exited" && e.status !== "on_notice" && (
                <Button variant="danger" icon={<UserMinus className="h-4 w-4" aria-hidden />} onClick={() => setOffboard(true)}>
                  Start exit
                </Button>
              )}
              {e.status === "probation" && !e.probationExtended && e.probationEndDate && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (window.confirm("Extend probation by 3 months? This can be done only once.")) {
                      if (await toast.run(api.employees.update(e.id, { extendProbation: true }), "Probation extended")) emp.reload();
                    }
                  }}
                >
                  Extend probation
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      <Tabs items={tabs} active={tab} onChange={setTab} label="Employee record sections" />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-4">
        {tab === "work" && (
          <Card title="Work information">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Job title" value={e.jobTitle} />
              <Field label="Employment type" value={humanize(e.employmentType)} />
              <Field label="Status" value={humanize(e.status)} />
              <Field label="Probation ends" value={fmtDate(e.probationEndDate)} />
              <Field label="Probation extended" value={e.probationExtended ? "Yes (once)" : "No"} />
              <Field label="Contract ends" value={fmtDate(e.contractEndDate)} />
              {e.exitDate && <Field label="Exit date" value={fmtDate(e.exitDate)} />}
            </dl>
          </Card>
        )}
        {tab === "private" && (
          <Card title="Private information">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Gender" value={humanize(e.gender || "")} />
              <Field label="Nationality" value={e.nationality} />
              {sensitiveVisible ? <Field label="Date of birth" value={fmtDate(e.dateOfBirth)} /> : <Hidden label="Date of birth" />}
              {sensitiveVisible ? <Field label="National ID / Passport" value={e.nationalIdNo} /> : <Hidden label="National ID / Passport" />}
              {sensitiveVisible ? <Field label="KRA PIN" value={e.kraPin} /> : <Hidden label="KRA PIN" />}
              {sensitiveVisible ? <Field label="NSSF no." value={e.nssfNo} /> : <Hidden label="NSSF no." />}
              {sensitiveVisible ? <Field label="SHA no." value={e.shaNo} /> : <Hidden label="SHA no." />}
              {sensitiveVisible ? <Field label="Bank" value={[e.bankName, e.bankAccount].filter(Boolean).join(" · ")} /> : <Hidden label="Bank" />}
              <Field label="Home address" value={e.address} />
              <Field label="Emergency contact" value={[e.emergencyContactName, e.emergencyContactRelation && `(${e.emergencyContactRelation})`, e.emergencyContactPhone].filter(Boolean).join(" ")} />
            </dl>
            {hr && <p className="mt-4 text-xs text-muted">Opening this record is logged in the audit trail.</p>}
          </Card>
        )}
        {tab === "docs" && (
          <>
            <p className="text-sm text-muted">
              Documents the employee uploaded from their portal. {e.documentsVerified ?? 0} of {e.documentsRequired} required documents are verified.
            </p>
            {docs.error ? (
              <ErrorState error={docs.error} onRetry={docs.reload} />
            ) : (
              <DocumentChecklist
                items={docs.data ?? []}
                mode="hr"
                onUpload={async (type, file, expiry) => {
                  await api.employees.uploadDocument(e.id, file, type, expiry || undefined);
                  toast.success("Document uploaded");
                  refreshAll();
                }}
                onDownload={(d) => void toast.run(api.documents.download(d), "Download started")}
                onVerify={async (d) => {
                  if (await toast.run(api.documents.verify(d.id), "Document verified")) refreshAll();
                }}
                onReject={async (d, reason) => {
                  await api.documents.reject(d.id, reason);
                  toast.success("Document rejected");
                  refreshAll();
                }}
                onDelete={async (d) => {
                  if (window.confirm(`Delete ${d.typeLabel}? This cannot be undone.`) && (await toast.run(api.documents.remove(d.id), "Document deleted"))) refreshAll();
                }}
              />
            )}
          </>
        )}
        {tab === "leave" &&
          (leave.error ? (
            <ErrorState error={leave.error} onRetry={leave.reload} />
          ) : leave.loading && !leave.data ? (
            <BlockSkeleton lines={6} />
          ) : (
            leave.data && (
              <>
                {hr && (
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setBalanceOpen(true)}>
                      Leave settings
                    </Button>
                  </div>
                )}
                <LeavePanel summary={leave.data} onChange={leave.reload} canApply={e.id === user?.employeeId || (hr && e.status !== "exited")} employeeId={hr && e.id !== user?.employeeId ? e.id : undefined} employeeName={e.fullName} />
                {hr && <LeaveBalanceModal open={balanceOpen} onClose={() => setBalanceOpen(false)} onDone={leave.reload} employeeId={e.id} name={e.fullName} balance={leave.data.balance} />}
              </>
            )
          ))}
        {tab === "tasks" && (
          <>
            {hr && tasks.data && tasks.data.length === 0 && e.status !== "exited" && (
              <Button variant="gold" onClick={async () => { if (await toast.run(api.employees.startOnboarding(e.id), "Onboarding tasks created")) tasks.reload(); }}>
                Start onboarding
              </Button>
            )}
            <TaskList tasks={tasks.data ?? []} canEdit={canManageTasks} onStatus={setTaskStatus} />
          </>
        )}
        {tab === "team" &&
          (team.data && team.data.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {team.data.map((m) => (
                <li key={m.id}>
                  <Link href={`/employees/${m.id}`} className="flex items-center gap-3 rounded-[14px] border border-line bg-white p-3 shadow-card hover:shadow-lift">
                    <AuthImage employeeId={m.id} name={m.fullName} hasPhoto={m.hasPhoto} className="h-12 w-12 rounded-full" textClass="text-sm" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{m.fullName}</p>
                      <p className="truncate text-sm text-muted">{m.jobTitle}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No direct reports" />
          ))}
      </div>

      <Modal open={editing} title={`Edit ${e.fullName}`} onClose={() => setEditing(false)} size="xl">
        <EmployeeForm
          employee={e}
          managers={managers.data?.items ?? []}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await api.employees.update(e.id, input);
            toast.success("Employee updated");
            setEditing(false);
            refreshAll();
          }}
        />
      </Modal>

      <Modal
        open={offboard}
        title={`Start exit process: ${e.fullName}`}
        onClose={() => setOffboard(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOffboard(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (await toast.run(api.employees.startOffboarding(e.id, exitDate), "Exit tasks created")) {
                  setOffboard(false);
                  refreshAll();
                  setTab("tasks");
                }
              }}
            >
              Start exit process
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">The employee is marked on notice and the exit checklist is created. Final dues are due within 7 working days.</p>
        <Input label="Last working day" type="date" value={exitDate} onChange={(ev) => setExitDate(ev.target.value)} required />
      </Modal>
    </>
  );
}
