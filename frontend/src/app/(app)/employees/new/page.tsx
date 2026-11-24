"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmployeeForm } from "@/components/EmployeeForm";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import type { EmployeeCreated } from "@/lib/types";

export default function NewEmployeePage() {
  const router = useRouter();
  const toast = useToast();
  const { data: managers } = useAsync(() => api.employees.list({ pageSize: 100 }), []);
  const [created, setCreated] = useState<EmployeeCreated | null>(null);

  return (
    <>
      <PageHeader title="New employee" subtitle="Records start on probation. Documents are collected from the employee's own portal." />
      <Card>
        <EmployeeForm
          managers={managers?.items ?? []}
          submitLabel="Create employee"
          onCancel={() => router.push("/employees")}
          onSubmit={async (input) => {
            const e = await api.employees.create(input);
            if (e.temporaryPassword) setCreated(e);
            else {
              toast.success(`${e.fullName} was added`);
              router.push(`/employees/${e.id}`);
            }
          }}
        />
      </Card>
      <Modal
        open={!!created}
        title="Employee created"
        onClose={() => created && router.push(`/employees/${created.id}`)}
        footer={<Button onClick={() => created && router.push(`/employees/${created.id}`)}>Open record</Button>}
      >
        {created && (
          <div className="space-y-3 text-sm">
            <p>
              <strong>{created.fullName}</strong> can sign in with <strong>{created.email}</strong> and this temporary password. It is shown only once; they must change it at first sign-in.
            </p>
            <p className="select-all rounded-[10px] bg-gold-soft px-4 py-3 text-center font-mono text-lg font-bold tracking-wider text-navy-dark">{created.temporaryPassword}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
