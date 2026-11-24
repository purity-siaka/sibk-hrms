"use client";

import { KeyRound, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/Button";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { FormGrid, Input, Select } from "@/components/Fields";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { Pill, StatusPill } from "@/components/Pill";
import { Table } from "@/components/Table";
import { useToast } from "@/components/Toast";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, api } from "@/lib/api";
import { fmtDateTime, humanize } from "@/lib/format";
import type { Role } from "@/lib/types";

const ROLES: Role[] = ["employee", "manager", "hr_officer", "hr_admin"];

export default function UsersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const list = useAsync(() => api.users.list(), []);
  const emps = useAsync(() => api.employees.list({ pageSize: 100 }), []);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", role: "employee" as Role, employeeId: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ who: string; pw: string } | null>(null);

  const create = async () => {
    setBusy(true);
    try {
      const res = (await api.users.create({ name: f.name, email: f.email, role: f.role, employeeId: f.employeeId ? Number(f.employeeId) : null })) as unknown as { user: { email: string }; temporaryPassword?: string };
      setOpen(false);
      setF({ name: "", email: "", role: "employee", employeeId: "" });
      setErrs({});
      list.reload();
      if (res.temporaryPassword) setSecret({ who: res.user.email, pw: res.temporaryPassword });
    } catch (e) {
      setErrs(e instanceof ApiError ? e.fields : { name: "Could not create the account" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Users and access" subtitle="Who can sign in, and what they can see." actions={<Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setOpen(true)}>New user</Button>} />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <Table
          caption="User accounts"
          loading={list.loading && !list.data}
          rows={list.data ?? []}
          rowKey={(u) => u.id}
          empty={<EmptyState title="No users" />}
          columns={[
            { key: "n", header: "Name", render: (u) => <div><p className="font-semibold text-ink">{u.name}</p><p className="text-xs text-muted">{u.email}</p></div> },
            {
              key: "r",
              header: "Role",
              render: (u) => (
                <select aria-label={`Role for ${u.name}`} value={u.role} disabled={u.id === user?.id} className="rounded-lg border border-[#C5CEEA] bg-white px-2 py-1.5 text-sm"
                  onChange={async (e) => { if (await toast.run(api.users.update(u.id, { role: e.target.value as Role }), "Role updated")) list.reload(); }}>
                  {ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
                </select>
              ),
            },
            { key: "s", header: "Status", render: (u) => (u.active ? <StatusPill status="active" /> : <Pill>Deactivated</Pill>) },
            { key: "l", header: "Last sign-in", render: (u) => fmtDateTime(u.lastLoginAt) || <span className="text-muted">Never</span> },
            {
              key: "a",
              header: "",
              render: (u) => (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="ghost" icon={<KeyRound className="h-4 w-4" aria-hidden />} onClick={async () => {
                    if (!window.confirm(`Reset the password for ${u.name}?`)) return;
                    const r = await toast.run(api.users.resetPassword(u.id), "Password reset");
                    if (r) setSecret({ who: u.email, pw: r.temporaryPassword });
                  }}>Reset password</Button>
                  {u.id !== user?.id && (
                    <Button size="sm" variant={u.active ? "danger" : "primary"} onClick={async () => { if (await toast.run(api.users.update(u.id, { active: !u.active }), u.active ? "Account deactivated" : "Account reactivated")) list.reload(); }}>
                      {u.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
      <Modal open={open} title="New user" onClose={() => setOpen(false)} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={create}>Create user</Button></>}>
        <div className="space-y-4">
          <FormGrid>
            <Input label="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errs.name} required />
            <Input label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errs.email} required />
            <Select label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })} error={errs.role}>
              {ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
            </Select>
            <Select label="Linked employee" value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} error={errs.employeeId}>
              <option value="">None</option>
              {(emps.data?.items ?? []).map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </Select>
          </FormGrid>
          <p className="text-xs text-muted">A temporary password is generated and shown once. The user must change it at first sign-in.</p>
        </div>
      </Modal>
      <Modal open={!!secret} title="Temporary password" onClose={() => setSecret(null)} footer={<Button onClick={() => setSecret(null)}>Done</Button>}>
        {secret && (
          <div className="space-y-3 text-sm">
            <p>Give this to <strong>{secret.who}</strong>. It is shown only once.</p>
            <p className="select-all rounded-[10px] bg-gold-soft px-4 py-3 text-center font-mono text-lg font-bold tracking-wider text-navy-dark">{secret.pw}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
