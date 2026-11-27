"use client";

import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { isHR } from "@/lib/access";
import type { TaskKind } from "@/lib/types";
import { ErrorState } from "./EmptyState";
import { FilterSelect } from "./Fields";
import { FilterBar, PageHeader } from "./PageHeader";
import { BlockSkeleton } from "./Skeleton";
import { TaskCards } from "./TaskList";

export function TasksView({ kind }: { kind: TaskKind }) {
  const { user } = useAuth();
  const hr = isHR(user);
  const [status, setStatus] = useState("open");
  const [owner, setOwner] = useState("");
  const list = useAsync(() => api.tasks.list({ kind, ownerRole: owner || undefined }), [kind, owner]);
  const rows = (list.data ?? []).filter((t) => (status === "open" ? t.status === "pending" || t.status === "in_progress" : status ? t.status === status : true));
  return (
    <>
      <PageHeader
        title={kind === "onboarding" ? "Onboarding" : "Offboarding"}
        subtitle={kind === "onboarding" ? "Add what a new joiner needs, say who it is for, and tick it off when done." : "The exit checklist. Final dues are due within 7 working days."}
      />
      <FilterBar>
        <FilterSelect label="Status" value={status} onChange={setStatus}>
          <option value="open">Open</option>
          <option value="done">Done</option>
          <option value="">All</option>
        </FilterSelect>
        {hr && (
          <FilterSelect label="Responsible" value={owner} onChange={setOwner}>
            <option value="">Everyone</option>
            <option value="hr">HR</option>
            <option value="it">IT</option>
            <option value="finance">Finance</option>
            <option value="line_manager">Line manager</option>
          </FilterSelect>
        )}
      </FilterBar>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <BlockSkeleton lines={6} />
      ) : (
        <TaskCards tasks={rows} kind={kind} hr={hr} canMark onChange={list.reload} showEmployee />
      )}
    </>
  );
}
