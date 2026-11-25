"use client";

import { FileText, GraduationCap, Paperclip, Plus } from "lucide-react";
import { useState } from "react";
import { ApplyLeaveModal } from "./ApplyLeaveModal";
import { Button } from "./Button";
import { Card, StatCard } from "./Card";
import { EmptyState } from "./EmptyState";
import { Pill, StatusPill } from "./Pill";
import { ReasonModal } from "./ReasonModal";
import { Table } from "./Table";
import { useToast } from "./Toast";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { Leave, LeaveSummary } from "@/lib/types";

export function DateRange({ l }: { l: Pick<Leave, "fromDate" | "toDate"> }) {
  return <span>{l.fromDate === l.toDate ? fmtDate(l.fromDate) : `${fmtDate(l.fromDate)} to ${fmtDate(l.toDate)}`}</span>;
}

/** Leave type; a training application shows its title and provider. */
export function TypeCell({ l }: { l: Leave }) {
  if (l.type !== "training") return <span className="font-semibold text-ink">{l.typeLabel}</span>;
  return (
    <div>
      <span className="font-semibold text-ink">Training</span>
      <p className="text-xs text-muted">{[l.trainingTitle, l.trainingProvider].filter(Boolean).join(", ")}</p>
    </div>
  );
}

/** Request status with the sick-note warning. */
export function LeaveStatusCell({ l }: { l: Leave }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusPill status={l.status} />
      {l.needsNote && <Pill tone="bad">Sick note missing</Pill>}
    </div>
  );
}

/** Row actions that apply to the viewer: attach sick note, download note, cancel. */
export function LeaveActions({ l, onChange }: { l: Leave; onChange: () => void }) {
  const toast = useToast();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {l.hasNote && (
        <button type="button" onClick={() => void toast.run(api.leave.downloadNote(l), "Download started")} className="inline-flex items-center gap-1 text-sm font-semibold text-navy hover:underline">
          <FileText className="h-4 w-4" aria-hidden /> Sick note
        </button>
      )}
      {l.canAttach && (
        <label className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-navy hover:underline">
          <Paperclip className="h-4 w-4" aria-hidden /> {l.hasNote ? "Replace note" : "Attach sick note"}
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.docx"
            className="sr-only"
            onChange={async (ev) => {
              const f = ev.target.files?.[0];
              ev.target.value = "";
              if (f && (await toast.run(api.leave.attach(l.id, f), "Sick note attached"))) onChange();
            }}
          />
        </label>
      )}
      {l.canCancel && (
        <button
          type="button"
          onClick={async () => {
            if (window.confirm(`Cancel this ${l.typeLabel.toLowerCase()} leave request?`) && (await toast.run(api.leave.cancel(l.id), "Request cancelled"))) onChange();
          }}
          className="text-sm font-semibold text-danger hover:underline"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

/** Balance cards and the request history of one employee. */
export function LeavePanel({
  summary,
  onChange,
  canApply,
  employeeId,
  employeeName,
}: {
  summary: LeaveSummary;
  onChange: () => void;
  canApply: boolean;
  /** set when HR records leave for someone else */
  employeeId?: number;
  employeeName?: string;
}) {
  const [applying, setApplying] = useState<null | "leave" | "training">(null);
  const b = summary.balance;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Annual leave remaining" value={b.remainingDays} hint={b.pendingDays > 0 ? `${b.pendingDays} awaiting approval` : undefined} />
        <StatCard label="Accrued this year" value={b.accruedDays} />
        <StatCard label="Carried forward" value={b.carriedForwardDays} />
        <StatCard label="Annual leave taken" value={b.takenDays} />
      </div>
      <Card
        title="Leave requests"
        padded={false}
        action={
          canApply && (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" icon={<GraduationCap className="h-4 w-4" aria-hidden />} onClick={() => setApplying("training")}>
                {employeeId ? "Record training" : "Training application"}
              </Button>
              <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setApplying("leave")}>
                {employeeId ? "Record leave" : "Apply for leave"}
              </Button>
            </div>
          )
        }
      >
        <div className="p-5 pt-3">
          <Table
            caption="Leave requests"
            rows={summary.requests}
            rowKey={(l) => l.id}
            empty={<EmptyState title="No leave requests yet" text="Requests will appear here once submitted." />}
            columns={[
              { key: "type", header: "Type", render: (l) => <TypeCell l={l} /> },
              { key: "dates", header: "Dates", render: (l) => <DateRange l={l} /> },
              { key: "days", header: "Days", render: (l) => l.days },
              { key: "status", header: "Status", render: (l) => <LeaveStatusCell l={l} /> },
              {
                key: "decision",
                header: "Decision",
                hideOnMobile: true,
                render: (l) => (
                  <div className="max-w-[280px] text-sm">
                    {l.status === "pending" ? (
                      <span className="text-muted">Waiting for {l.approverName}</span>
                    ) : (
                      <>
                        {l.decidedByName && <span className="text-ink">{l.decidedByName}{l.decidedAt && `, ${fmtDate(l.decidedAt)}`}</span>}
                        {l.comment && <p className="text-muted">{l.comment}</p>}
                      </>
                    )}
                  </div>
                ),
              },
              { key: "actions", header: "", render: (l) => <LeaveActions l={l} onChange={onChange} /> },
            ]}
          />
        </div>
      </Card>
      <ApplyLeaveModal
        open={applying !== null}
        mode={applying === "training" ? "training" : "leave"}
        onClose={() => setApplying(null)}
        onDone={onChange}
        employeeId={employeeId}
        employeeName={employeeName}
        availableDays={b.availableDays}
      />
    </>
  );
}

/** Pending requests the viewer can approve or reject. */
export function ApprovalList({ items, onChange, empty }: { items: Leave[]; onChange: () => void; empty: string }) {
  const toast = useToast();
  const [deciding, setDeciding] = useState<{ leave: Leave; decision: "approve" | "reject" } | null>(null);
  if (items.length === 0) return <EmptyState title="Nothing waiting" text={empty} />;
  return (
    <>
      <ul className="grid gap-3 lg:grid-cols-2">
        {items.map((l) => (
          <li key={l.id} className="rounded-[14px] border border-line bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold text-ink">{l.employeeName}</p>
                <p className="text-sm text-muted">
                  {l.type === "training" ? `Training: ${l.trainingTitle ?? ""}${l.trainingProvider ? `, ${l.trainingProvider}` : ""}` : `${l.typeLabel} leave`} · <DateRange l={l} /> · <strong className="text-ink">{l.days} {l.days === 1 ? "day" : "days"}</strong>
                </p>
              </div>
              <LeaveStatusCell l={l} />
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{l.reason}</p>
            {l.type === "annual" && <p className="mt-1 text-xs text-muted">Balance at request: {l.daysRemainingAtRequest} days</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => setDeciding({ leave: l, decision: "approve" })}>
                Approve
              </Button>
              <Button size="sm" variant="danger" onClick={() => setDeciding({ leave: l, decision: "reject" })}>
                Reject
              </Button>
              {l.hasNote && (
                <button type="button" onClick={() => void toast.run(api.leave.downloadNote(l), "Download started")} className="inline-flex items-center gap-1 text-sm font-semibold text-navy hover:underline">
                  <FileText className="h-4 w-4" aria-hidden /> Sick note
                </button>
              )}
              <span className="ml-auto text-xs text-muted">{l.approverType === "hr" ? "HR decides" : l.approverType === "ceo" ? "CEO decides" : "Line manager decides (final)"}</span>
            </div>
          </li>
        ))}
      </ul>
      <ReasonModal
        open={!!deciding}
        title={deciding ? `${deciding.decision === "approve" ? "Approve" : "Reject"} ${deciding.leave.employeeName}'s leave` : ""}
        label={deciding?.decision === "reject" ? "Reason (the employee will see this)" : "Comment (optional)"}
        confirmLabel={deciding?.decision === "reject" ? "Reject request" : "Approve request"}
        tone={deciding?.decision === "reject" ? "danger" : "primary"}
        required={deciding?.decision === "reject"}
        onClose={() => setDeciding(null)}
        onSubmit={async (text) => {
          if (!deciding) return;
          await api.leave.decide(deciding.leave.id, deciding.decision, text);
          toast.success(deciding.decision === "approve" ? "Leave approved" : "Leave rejected");
          onChange();
        }}
      />
    </>
  );
}
