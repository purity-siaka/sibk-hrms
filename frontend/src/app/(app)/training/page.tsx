"use client";

import { useState } from "react";
import { ErrorState } from "@/components/EmptyState";
import { FilterSelect } from "@/components/Fields";
import { FilterBar, PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/Card";
import { BlockSkeleton } from "@/components/Skeleton";
import { TrainingPanel } from "@/components/TrainingPanel";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/api";

export default function TrainingPage() {
  const [sponsorship, setSponsorship] = useState("");
  const [status, setStatus] = useState("");
  const all = useAsync(() => api.training.list({}), []);
  const list = useAsync(() => api.training.list({ sponsorship: sponsorship || undefined, status: status || undefined }), [sponsorship, status]);
  const rows = all.data ?? [];
  const sibk = rows.filter((t) => t.sponsorship === "sibk");
  const money = (n: number) => `KES ${n.toLocaleString("en-KE")}`;
  const sibkPaid = rows.reduce((n, t) => n + t.sibkAmount, 0);
  const selfPaid = rows.reduce((n, t) => n + t.selfAmount, 0);
  return (
    <>
      <PageHeader title="Training" subtitle="Who is training, and who is paying. Helps SIBK see what it contributes to its people's growth." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Trainings recorded" value={rows.length} />
        <StatCard label="Sponsored by SIBK" value={sibk.length} />
        <StatCard label="Self-sponsored" value={rows.length - sibk.length} />
        <StatCard label="SIBK paid / self paid" value={`${money(sibkPaid)} / ${money(selfPaid)}`} hint="From the amounts entered in updates" />
      </div>
      <FilterBar>
        <FilterSelect label="Sponsor" value={sponsorship} onChange={setSponsorship}>
          <option value="">Everyone paying</option>
          <option value="sibk">SIBK-sponsored</option>
          <option value="self">Self-sponsored</option>
        </FilterSelect>
        <FilterSelect label="Status" value={status} onChange={setStatus}>
          <option value="">Every status</option>
          <option value="upcoming">Upcoming</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </FilterSelect>
      </FilterBar>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <BlockSkeleton lines={6} />
      ) : (
        <TrainingPanel items={list.data ?? []} showEmployee onChange={() => { list.reload(); all.reload(); }} emptyText="Nothing matches. Employees add their training from My portal, My training." />
      )}
    </>
  );
}
