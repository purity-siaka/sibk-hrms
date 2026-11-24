"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, IconButton } from "@/components/Button";
import { Checkbox, FormGrid, Input } from "@/components/Fields";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { Pill } from "@/components/Pill";
import { BlockSkeleton } from "@/components/Skeleton";
import { Table } from "@/components/Table";
import { useToast } from "@/components/Toast";
import { useAsync } from "@/hooks/useAsync";
import { api, ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export default function Holidays() {
  const toast = useToast();
  const list = useAsync(() => api.leave.holidays(), []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [yearly, setYearly] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api.leave.addHoliday({ name, date, repeatsYearly: yearly });
      toast.success("Holiday added");
      setOpen(false);
      setName("");
      setDate("");
      setYearly(false);
      list.reload();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else toast.error(e instanceof Error ? e.message : "Could not add the holiday");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Public holidays"
        subtitle="Holidays are not counted as leave days. Add Eid and other movable holidays here each year once they are announced."
        actions={<Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setOpen(true)}>Add holiday</Button>}
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <BlockSkeleton lines={8} />
      ) : (
        <Table
          caption="Public holidays"
          rows={list.data ?? []}
          rowKey={(h) => h.id}
          empty={<EmptyState title="No holidays yet" />}
          columns={[
            { key: "date", header: "Date", render: (h) => <span className="font-semibold text-ink">{fmtDate(h.date)}</span> },
            { key: "name", header: "Holiday", render: (h) => h.name },
            { key: "rep", header: "", render: (h) => (h.repeatsYearly ? <Pill tone="info">Repeats yearly</Pill> : null) },
            {
              key: "del",
              header: "",
              render: (h) => (
                <IconButton
                  label={`Remove ${h.name}`}
                  onClick={async () => {
                    if (window.confirm(`Remove ${h.name} (${fmtDate(h.date)})?`) && (await toast.run(api.leave.removeHoliday(h.id), "Holiday removed"))) list.reload();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              ),
            },
          ]}
        />
      )}
      <Modal
        open={open}
        title="Add public holiday"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={busy} onClick={save} disabled={!name.trim() || !date}>Add holiday</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormGrid>
            <Input label="Holiday name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required />
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} required />
          </FormGrid>
          <Checkbox label="Same date every year" hint="Tick for fixed holidays such as Christmas. Leave unticked for movable ones." checked={yearly} onChange={(e) => setYearly(e.target.checked)} />
        </div>
      </Modal>
    </>
  );
}
