"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AuthImage } from "@/components/AuthImage";
import { Button } from "@/components/Button";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { FilterSelect, SearchInput } from "@/components/Fields";
import { FilterBar, PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { StatusPill } from "@/components/Pill";
import { CardGridSkeleton } from "@/components/Skeleton";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { useDebounced } from "@/hooks/useDebounced";
import { useDepartments, useReference } from "@/hooks/useReference";
import { api } from "@/lib/api";
import { isHR } from "@/lib/access";
import { humanize } from "@/lib/format";

const PAGE_SIZE = 24;

export default function EmployeesPage() {
  const { user } = useAuth();
  const hr = isHR(user);
  const ref = useReference();
  const departments = useDepartments();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useAsync(
    () => api.employees.list({ q: dq, departmentId: dept, status, page, pageSize: PAGE_SIZE }),
    [dq, dept, status, page],
  );

  return (
    <>
      <PageHeader
        title={hr ? "Employees" : "My team"}
        subtitle={hr ? "Select a card to open the employee's full record." : "People who report to you."}
        actions={
          hr && (
            <Link href="/employees/new">
              <Button icon={<Plus className="h-4 w-4" aria-hidden />}>New employee</Button>
            </Link>
          )
        }
      />
      <FilterBar>
        <SearchInput label="Search employees" placeholder="Search by name, email or position" value={q} onChange={(v) => { setQ(v); setPage(1); }} />
        {hr && (
          <FilterSelect label="Department" value={dept} onChange={(v) => { setDept(v); setPage(1); }}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </FilterSelect>
        )}
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }}>
          <option value="">All statuses</option>
          {ref.employeeStatuses.map((s) => (
            <option key={s} value={s}>{humanize(s)}</option>
          ))}
        </FilterSelect>
      </FilterBar>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <CardGridSkeleton />
      ) : data && data.items.length === 0 ? (
        <EmptyState title="No employees found" text={q || dept || status ? "Try a different search or clear the filters." : "Add the first employee to get started."} />
      ) : (
        data && (
          <>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy={loading}>
              {data.items.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/employees/${e.id}`}
                    className="flex h-full items-center justify-between gap-4 rounded-[14px] border border-line bg-white p-4 shadow-card transition-shadow hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-ink">{e.fullName}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted">{e.jobTitle}</p>
                      <p className="mt-1 truncate text-xs text-muted">{e.departmentName || "No department"}</p>
                      <div className="mt-2">
                        <StatusPill status={e.status} />
                      </div>
                    </div>
                    <AuthImage employeeId={e.id} name={e.fullName} hasPhoto={e.hasPhoto} className="h-[92px] w-[74px] shrink-0 rounded-lg border border-line" textClass="text-xl" />
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
          </>
        )
      )}
    </>
  );
}
