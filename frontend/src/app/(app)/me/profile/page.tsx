"use client";

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

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-[15px] text-ink">{value || <span className="text-muted">Not provided</span>}</dd>
    </div>
  );
}

function ContactForm({ e, onSaved }: { e: Employee; onSaved: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ phone: e.phone ?? "", address: e.address ?? "", emergencyContactName: e.emergencyContactName ?? "", emergencyContactPhone: e.emergencyContactPhone ?? "", emergencyContactRelation: e.emergencyContactRelation ?? "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof d) => (ev: { target: { value: string } }) => setD({ ...d, [k]: ev.target.value });
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    if (await toast.run(api.me.updateProfile(d), "Details saved")) onSaved();
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <FormGrid>
        <Input label="Phone" value={d.phone} onChange={set("phone")} />
        <Input label="Emergency contact" value={d.emergencyContactName} onChange={set("emergencyContactName")} />
        <Input label="Emergency phone" value={d.emergencyContactPhone} onChange={set("emergencyContactPhone")} />
        <Input label="Relationship" value={d.emergencyContactRelation} onChange={set("emergencyContactRelation")} />
      </FormGrid>
      <Textarea label="Home address" value={d.address} onChange={set("address")} />
      <Button type="submit" loading={busy}>Save details</Button>
    </form>
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
            <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <Row label="Employee no." value={e.employeeNo} />
              <Row label="Work email" value={e.email} />
              <Row label="Department" value={e.departmentName} />
              <Row label="Manager" value={e.managerName} />
              <Row label="Employment type" value={humanize(e.employmentType)} />
              <Row label="Start date" value={fmtDate(e.startDate)} />
              <Row label="Probation ends" value={fmtDate(e.probationEndDate)} />
            </dl>
          </div>
        </div>
      </Card>

      <Card title="Contact details">
        <ContactForm e={e} onSaved={me.reload} />
      </Card>

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
