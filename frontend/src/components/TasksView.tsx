"use client";

import Link from "next/link";
import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { isHR } from "@/lib/access";
import { fmtDate, humanize } from "@/lib/format";
import type { Task, TaskKind } from "@/lib/types";
import { Button } from "./Button";
import { EmptyState, ErrorState } from "./EmptyState";
import { FilterSelect } from "./Fields";
import { FilterBar, PageHeader } from "./PageHeader";
import { StatusPill } from "./Pill";
import { Table } from "./Table";
import { useToast } from "./Toast";

export function TasksView({ kind }: { kind: TaskKind }) {
  const { user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState("open");
  const [owner, setOwner] = useState("");
  const list = useAsync(() => api.tasks.list({ kind, ownerRole: owner || undefined }), [kind, owner]);
  const rows = (list.data ?? []).filter((t) => (status === "open" ? t.status === "pending" || t.status === "in_progress" : status ? t.status === status : true));
  const today = new Date().toISOString().slice(0, 10);
  const set = async (t: Task, s: Task["status"]) => {
    if (await toast.run(api.tasks.update(t.id, { status: s }), "Task updated")) list.reload();
  };
  return (
    <>
      <PageHeader
        title={kind === "onboarding" ? "Onboarding tasks" : "Offboarding tasks"}
        subtitle={kind === "onboarding" ? "Everything a new joiner needs on and after day one." : "The exit checklist. Final dues are due within 7 working days."}
      />
      <FilterBar>
        <FilterSelect label="Status" value={status} onChange={setStatus}>
          <option value="open">Open</option>
          <option value="done">Done</option>
          <option value="">All</option>
        </FilterSelect>
        {isHR(user) && (
          <FilterSelect label="Owner" value={owner} onChange={setOwner}>
            <option value="">Every owner</option>
            <option value="hr">HR</option>
            <option value="it">IT</option>
            <option value="finance">Finance</option>
            <option value="line_manager">Line manager</option>
          </FilterSelect>
        )}
      </FilterBar>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <Table
          caption="Tasks"
          loading={list.loading && !list.data}
          rows={rows}
          rowKey={(t) => t.id}
          empty={<EmptyState title="No tasks" text="Tasks appear when an employee is hired or an exit is started." />}
          columns={[
            { key: "e", header: "Employee", render: (t) => <Link className="font-semibold text-navy hover:underline" href={`/employees/${t.employeeId}`}>{t.employeeName}</Link> },
            { key: "t", header: "Task", render: (t) => t.title },
            { key: "o", header: "Owner", render: (t) => humanize(t.ownerRole) },
            { key: "d", header: "Due", render: (t) => <span className={t.dueDate && t.dueDate < today && t.status !== "done" ? "font-semibold text-danger" : ""}>{fmtDate(t.dueDate)}</span> },
            { key: "s", header: "Status", render: (t) => <StatusPill status={t.status} /> },
            {
              key: "a",
              header: "",
              render: (t) =>
                t.status === "done" ? (
                  <Button size="sm" variant="quiet" onClick={() => set(t, "pending")}>Reopen</Button>
                ) : (
                  <Button size="sm" onClick={() => set(t, "done")}>Mark done</Button>
                ),
            },
          ]}
        />
      )}
    </>
  );
}
