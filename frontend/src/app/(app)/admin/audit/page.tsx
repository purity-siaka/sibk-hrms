"use client";

import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { FilterSelect, SearchInput } from "@/components/Fields";
import { FilterBar, PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { Table } from "@/components/Table";
import { useAsync } from "@/hooks/useAsync";
import { useDebounced } from "@/hooks/useDebounced";
import { api } from "@/lib/api";
import { fmtDateTime, humanize } from "@/lib/format";

const SIZE = 50;
const ENTITIES = ["employee", "document", "user", "applicant", "change_request", "report", "policy", "task", "department"];

export default function AuditPage() {
  const [actor, setActor] = useState("");
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(1);
  const dActor = useDebounced(actor);
  const list = useAsync(() => api.audit({ actor: dActor, entity, page, pageSize: SIZE }), [dActor, entity, page]);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what, and when. Includes every view of sensitive employee data and every document download." />
      <FilterBar>
        <SearchInput label="Search by person" placeholder="Search by person" value={actor} onChange={(v) => { setActor(v); setPage(1); }} />
        <FilterSelect label="Record type" value={entity} onChange={(v) => { setEntity(v); setPage(1); }}>
          <option value="">All record types</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{humanize(e)}</option>)}
        </FilterSelect>
      </FilterBar>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <>
          <Table
            caption="Audit log"
            loading={list.loading && !list.data}
            rows={list.data?.items ?? []}
            rowKey={(a) => a.id}
            empty={<EmptyState title="No entries match" />}
            columns={[
              { key: "t", header: "When", render: (a) => <span className="whitespace-nowrap">{fmtDateTime(a.at)}</span> },
              { key: "w", header: "Who", render: (a) => <div><p className="font-medium">{a.actorName || "System"}</p><p className="text-xs text-muted">{humanize(a.actorRole || "")}</p></div> },
              { key: "a", header: "Action", render: (a) => humanize(a.action) },
              { key: "e", header: "Record", render: (a) => `${humanize(a.entity)} ${a.entityId}` },
              { key: "s", header: "Details", render: (a) => <span className="line-clamp-2 max-w-sm">{a.summary}</span> },
              { key: "i", header: "IP", render: (a) => <span className="text-xs text-muted">{a.ip}</span> },
            ]}
          />
          <Pagination page={page} pageSize={SIZE} total={list.data?.total ?? 0} onChange={setPage} />
        </>
      )}
    </>
  );
}
