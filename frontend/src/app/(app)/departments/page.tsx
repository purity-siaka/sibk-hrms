"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/Button";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { Input, Select } from "@/components/Fields";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { Table } from "@/components/Table";
import { useToast } from "@/components/Toast";
import { useAsync } from "@/hooks/useAsync";
import { ApiError, api } from "@/lib/api";
import type { Department } from "@/lib/types";

export default function DepartmentsPage() {
  const toast = useToast();
  const deps = useAsync(() => api.departments.list(), []);
  const emps = useAsync(() => api.employees.list({ pageSize: 100 }), []);
  const [edit, setEdit] = useState<Department | "new" | null>(null);
  const [name, setName] = useState("");
  const [head, setHead] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const open = (d: Department | "new") => {
    setEdit(d);
    setName(d === "new" ? "" : d.name);
    setHead(d === "new" || !d.headId ? "" : String(d.headId));
    setErr("");
  };
  const save = async () => {
    if (!name.trim()) return setErr("Name is required.");
    setBusy(true);
    try {
      const body = { name: name.trim(), headId: head ? Number(head) : null };
      if (edit === "new") await api.departments.create(body);
      else if (edit) await api.departments.update(edit.id, body);
      toast.success("Department saved");
      setEdit(null);
      deps.reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.fields.name || e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Departments" actions={<Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => open("new")}>New department</Button>} />
      {deps.error ? (
        <ErrorState error={deps.error} onRetry={deps.reload} />
      ) : (
        <Table
          caption="Departments"
          loading={deps.loading && !deps.data}
          rows={deps.data ?? []}
          rowKey={(d) => d.id}
          empty={<EmptyState title="No departments yet" />}
          columns={[
            { key: "n", header: "Department", render: (d) => <span className="font-semibold text-ink">{d.name}</span> },
            { key: "h", header: "Head", render: (d) => d.headName || <span className="text-muted">Not set</span> },
            { key: "c", header: "Employees", render: (d) => d.employeeCount },
            {
              key: "a",
              header: "",
              className: "text-right",
              render: (d) => (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => open(d)} aria-label={`Edit ${d.name}`} />
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 className="h-4 w-4" aria-hidden />}
                    aria-label={`Delete ${d.name}`}
                    onClick={async () => {
                      if (window.confirm(`Delete ${d.name}?`) && (await toast.run(api.departments.remove(d.id), "Department deleted"))) deps.reload();
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      )}
      <Modal
        open={!!edit}
        title={edit === "new" ? "New department" : "Edit department"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button loading={busy} onClick={save}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={err} required />
          <Select label="Department head" value={head} onChange={(e) => setHead(e.target.value)}>
            <option value="">Not set</option>
            {(emps.data?.items ?? []).map((e) => (
              <option key={e.id} value={e.id}>{e.fullName}</option>
            ))}
          </Select>
        </div>
      </Modal>
    </>
  );
}
