"use client";

import { Plus } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { FilterSelect, SearchInput } from "@/components/Fields";
import { Button } from "@/components/Button";
import { NewSignOffModal } from "@/components/NewSignOffModal";
import { FilterBar, PageHeader } from "@/components/PageHeader";
import { Pill } from "@/components/Pill";
import { BlockSkeleton } from "@/components/Skeleton";
import { SignOffDetail, SO_STATUS } from "@/components/SignOffDetail";
import { Tabs } from "@/components/Tabs";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { isHR } from "@/lib/access";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { SignOff } from "@/lib/types";

function Row({ s, onOpen }: { s: SignOff; onOpen: () => void }) {
  const st = SO_STATUS[s.status];
  const signed = s.steps.filter((x) => x.status === "signed").length;
  return (
    <li>
      <button onClick={onOpen} className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
        <Card className="hover:shadow-lift">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-bold text-ink">{s.title}</p>
              <p className="text-sm text-muted">
                From {s.preparerName} · {s.categoryName}
                {s.processId && ` · ${s.processId}`} · {fmtDate(s.createdAt)}
              </p>
              {s.status === "in_progress" && (
                <p className="mt-1 text-sm text-ink">
                  {s.myTurn ? <strong className="text-gold-deep">Your signature is needed</strong> : <>Waiting for <strong>{s.waitingForName}</strong></>} · {signed} of {s.steps.length} signed
                </p>
              )}
              {s.status === "completed" && <p className="mt-1 text-sm text-muted">All {s.steps.length} signed, archived {fmtDateTime(s.completedAt)}</p>}
              {s.returnNote && (s.status === "returned" || s.status === "rejected") && <p className="mt-1 text-sm text-danger">{s.returnNote}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {s.myTurn && <Pill tone="wait">Action needed</Pill>}
              <Pill tone={st.tone}>{st.label}</Pill>
            </div>
          </div>
        </Card>
      </button>
    </li>
  );
}

function Inner() {
  const { user } = useAuth();
  const hr = isHR(user);
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState("inbox");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const depts = useAsync(() => api.departments.list(), []);
  const list = useAsync(() => api.signoffs.list({ box: tab, category: category || undefined, q: q || undefined }), [tab, category, q]);
  const counts = useAsync(() => api.signoffs.summary(), []);

  // a notification links here with ?open=ID
  const want = params.get("open");
  useEffect(() => {
    if (want && Number(want) > 0) {
      setOpen(Number(want));
      router.replace("/signoffs");
    }
  }, [want, router]);

  const refresh = () => {
    list.reload();
    counts.reload();
  };
  const tabs = [
    { key: "inbox", label: "Waiting for me", badge: counts.data?.awaiting || undefined },
    { key: "sent", label: "Sent by me" },
    { key: "archive", label: "Archive" },
    ...(hr ? [{ key: "all", label: "All documents (HR)" }] : []),
  ];
  const empty: Record<string, string> = {
    inbox: "Nothing is waiting for your signature.",
    sent: "Documents you send for signing, and have not been fully signed yet, appear here.",
    archive: "Fully signed documents you prepared or signed appear here.",
    all: "No sign-offs yet.",
  };
  return (
    <>
      <PageHeader
        title="Document Sign-offs"
        subtitle="Upload a document, choose who signs and in what order. It moves to the next person after each signature."
        actions={<Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreating(true)}>New sign-off</Button>}
      />
      <Tabs items={tabs} active={tab} onChange={setTab} label="Sign-off lists" />
      <FilterBar>
        <SearchInput label="Search documents" value={q} onChange={setQ} placeholder="Name or process ID" />
        <FilterSelect label="Category" value={category} onChange={setCategory}>
          <option value="">Every department</option>
          {(depts.data ?? []).map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </FilterSelect>
      </FilterBar>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <BlockSkeleton lines={5} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState title="No documents" text={empty[tab]} />
      ) : (
        <ul className="space-y-3">{(list.data ?? []).map((s) => <Row key={s.id} s={s} onOpen={() => setOpen(s.id)} />)}</ul>
      )}
      <SignOffDetail id={open} onClose={() => setOpen(null)} onChanged={refresh} />
      <NewSignOffModal open={creating} onClose={() => setCreating(false)} onSaved={(s) => { setTab("sent"); refresh(); setOpen(s.id); }} />
    </>
  );
}

export default function SignOffsPage() {
  return (
    <Suspense fallback={<BlockSkeleton lines={4} />}>
      <Inner />
    </Suspense>
  );
}
