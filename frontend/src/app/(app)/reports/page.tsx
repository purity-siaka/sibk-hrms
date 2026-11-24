"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";

const REPORTS = [
  { key: "employees", title: "Employee register", text: "Every employee with position, department, manager, status and key dates." },
  { key: "documents-compliance", title: "Document compliance", text: "For each current employee, the state of every required document: verified, pending, rejected or missing." },
  { key: "headcount", title: "Headcount by department", text: "Current headcount split by probation, active and on-notice." },
] as const;

export default function ReportsPage() {
  const toast = useToast();
  return (
    <>
      <PageHeader title="Reports" subtitle="Downloads open in Excel. Each export is recorded in the audit log." />
      <div className="grid gap-4 md:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.key} title={r.title}>
            <p className="min-h-[60px] text-sm text-muted">{r.text}</p>
            <Button className="mt-4" icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void toast.run(api.reports.download(r.key), "Download started")}>
              Download CSV
            </Button>
          </Card>
        ))}
      </div>
    </>
  );
}
