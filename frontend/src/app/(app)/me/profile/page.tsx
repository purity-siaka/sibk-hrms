"use client";

import { Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AuthImage } from "@/components/AuthImage";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState } from "@/components/EmptyState";
import { FormGrid, Input, Select, Textarea } from "@/components/Fields";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/Pill";
import { BlockSkeleton } from "@/components/Skeleton";
import { Table } from "@/components/Table";
import { useToast } from "@/components/Toast";
import { useAsync } from "@/hooks/useAsync";
import { ApiError, api } from "@/lib/api";
import { fmtDate, humanize } from "@/lib/format";
import { CHANGE_FIELDS, type Employee } from "@/lib/types";

function Line({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0 break-words text-[15px] text-ink">
      <dt className="inline font-bold uppercase">{label}:</dt> <dd className="inline">{value || <span className="text-muted">Not provided</span>}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-[15px] text-ink">{value || <span className="text-muted">Not provided</span>}</dd>
    </div>
  );
}

function ContactCard({ e, onSaved }: { e: Employee; onSaved: () => void }) {
  const toast = useToast();
  const saved = { phone: e.phone ?? "", emergencyContactName: e.emergencyContactName ?? "", emergencyContactPhone: e.emergencyContactPhone ?? "", emergencyContactRelation: e.emergencyContactRelation ?? "", address: e.address ?? "" };
  const [d, setD] = useState(saved);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof d) => (ev: { target: { value: string } }) => setD({ ...d, [k]: ev.target.value });
  const complete = Object.values(d).every((v) => v.trim() !== "");
  const changed = (Object.keys(d) as (keyof typeof d)[]).some((k) => d[k].trim() !== saved[k].trim());
  const cancel = () => {
    setD(saved);
    setEditing(false);
  };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!complete || !changed) return;
    setBusy(true);
    const trimmed = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim()])) as typeof d;
    const ok = await toast.run(api.me.updateProfile(trimmed), "Details saved");
    setBusy(false);
    if (ok) {
      setEditing(false);
      onSaved();
    }
  };
  return (
    <Card
      title="Contact details"
      action={
        !editing && (
          <Button variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setEditing(true)}>
            Edit details
          </Button>
        )
      }
    >
      {editing ? (
        <form onSubmit={submit} className="space-y-4">
          <FormGrid>
            <Input label="Phone" value={d.phone} onChange={set("phone")} required />
            <Input label="Alternative contact person" value={d.emergencyContactName} onChange={set("emergencyContactName")} required />
            <Input label="Alternative phone number" value={d.emergencyContactPhone} onChange={set("emergencyContactPhone")} required />
            <Input label="Relationship" value={d.emergencyContactRelation} onChange={set("emergencyContactRelation")} required />
          </FormGrid>
          <Textarea label="Physical address" value={d.address} onChange={set("address")} required />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy} disabled={!complete || !changed}>
              Save details
            </Button>
            <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
            {!complete && <span className="text-sm text-muted">Fill in every field to save.</span>}
          </div>
        </form>
      ) : (
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Row label="Phone" value={e.phone} />
          <Row label="Alternative contact person" value={e.emergencyContactName} />
          <Row label="Alternative phone number" value={e.emergencyContactPhone} />
          <Row label="Relationship" value={e.emergencyContactRelation} />
          <div className="sm:col-span-2">
            <Row label="Physical address" value={e.address} />
          </div>
        </dl>
      )}
    </Card>
  );
}

export default function MyProfile() {
  const toast = useToast();
  const me = useAsync(() => api.me.profile(), []);
  const reqs = useAsync(() => api.me.changeRequests(), []);
  const [field, setField] = useState("bankName");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (me.error) return <ErrorState error={me.error} onRetry={me.reload} />;
  if (me.loading || !me.data) return <BlockSkeleton lines={8} />;
  const e = me.data;

  const submitChange = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!value.trim()) return setErr("Enter the new value.");
    setBusy(true);
    try {
      await api.me.requestChange({ field, newValue: value.trim(), reason: reason.trim() || undefined });
      toast.success("Request sent to HR");
      setValue(""); setReason(""); setErr("");
      reqs.reload();
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Could not send the request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="My profile" />
      <Card>
        <div className="flex flex-col gap-5 sm:flex-row">
          <AuthImage employeeId={e.id} name={e.fullName} hasPhoto={e.hasPhoto} className="h-[132px] w-[106px] rounded-xl border border-line" textClass="text-3xl" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold text-ink">{e.fullName}</h2>
              <StatusPill status={e.status} />
            </div>
            <p className="text-muted">{e.jobTitle}</p>
            <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              <Line label="Staff no." value={e.employeeNo} />
              <Line label="Work email" value={e.email} />
              <Line label="Department" value={e.departmentName} />
              <Line label="Manager" value={e.managerName} />
              <Line label="Employment type" value={humanize(e.employmentType)} />
              <Line label="Start date" value={fmtDate(e.startDate)} />
              <Line label="Probation ends" value={fmtDate(e.probationEndDate)} />
            </dl>
          </div>
        </div>
      </Card>

      <ContactCard key={`${e.phone}|${e.address}|${e.emergencyContactPhone}`} e={e} onSaved={me.reload} />

      <Card title="Official details">
        <p className="mb-3 text-sm text-muted">These are held by HR. To change one, send a request below.</p>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Row label="National ID / Passport" value={e.nationalIdNo} />
          <Row label="KRA PIN" value={e.kraPin} />
          <Row label="NSSF no." value={e.nssfNo} />
          <Row label="SHA no." value={e.shaNo} />
          <Row label="Bank" value={[e.bankName, e.bankAccount].filter(Boolean).join(" · ")} />
          <Row label="Date of birth" value={fmtDate(e.dateOfBirth)} />
        </dl>
        <form onSubmit={submitChange} className="mt-5 space-y-4 rounded-[12px] bg-[#F8F9FD] p-4">
          <h3 className="text-sm font-bold text-navy">Ask HR to change a detail</h3>
          <FormGrid>
            <Select label="Detail" value={field} onChange={(ev) => setField(ev.target.value)}>
              {CHANGE_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </Select>
            <Input label="New value" value={value} onChange={(ev) => setValue(ev.target.value)} error={err} />
          </FormGrid>
          <Input label="Reason (optional)" value={reason} onChange={(ev) => setReason(ev.target.value)} />
          <Button type="submit" loading={busy}>Send request</Button>
        </form>
        {(reqs.data ?? []).length > 0 && (
          <div className="mt-5">
            <Table
              caption="My change requests"
              rows={reqs.data ?? []}
              rowKey={(r) => r.id}
              columns={[
                { key: "f", header: "Detail", render: (r) => CHANGE_FIELDS.find((x) => x.key === r.field)?.label ?? r.field },
                { key: "n", header: "Requested", render: (r) => r.newValue },
                { key: "d", header: "Date", render: (r) => fmtDate(r.createdAt) },
                { key: "s", header: "Status", render: (r) => <StatusPill status={r.status} /> },
                { key: "x", header: "HR note", render: (r) => r.decisionNote || "" },
              ]}
            />
          </div>
        )}
      </Card>
    </>
  );
}
