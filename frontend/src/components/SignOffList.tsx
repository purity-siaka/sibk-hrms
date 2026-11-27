"use client";

import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { EmptyState, ErrorState } from "./EmptyState";
import { Pill } from "./Pill";
import { BlockSkeleton } from "./Skeleton";
import { SignOffDetail, SO_STATUS } from "./SignOffDetail";
import { Card } from "./Card";

/** HR view inside an employee profile: every sign-off this person prepared or signs. */
export function SignOffList({ employeeId }: { employeeId: number }) {
  const list = useAsync(() => api.signoffs.list({ box: "all", employeeId }), [employeeId]);
  const [open, setOpen] = useState<number | null>(null);
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (list.loading && !list.data) return <BlockSkeleton lines={4} />;
  const rows = list.data ?? [];
  return (
    <>
      {rows.length === 0 ? (
        <EmptyState title="No sign-offs" text="This person has not prepared or been asked to sign any document." />
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => (
            <li key={s.id}>
              <button className="block w-full text-left" onClick={() => setOpen(s.id)}>
                <Card className="hover:shadow-lift">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-ink">{s.title}</p>
                      <p className="text-sm text-muted">From {s.preparerName} · {s.categoryName} · {fmtDate(s.createdAt)}</p>
                    </div>
                    <Pill tone={SO_STATUS[s.status].tone}>{SO_STATUS[s.status].label}</Pill>
                  </div>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}
      <SignOffDetail id={open} onClose={() => setOpen(null)} onChanged={list.reload} />
    </>
  );
}
