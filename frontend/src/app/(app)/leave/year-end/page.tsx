"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Fields";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

export default function YearEnd() {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  if (user?.role !== "hr_admin") {
    return <p className="text-sm text-muted">Only an HR administrator can run the year-end carry forward.</p>;
  }
  const run = async () => {
    setBusy(true);
    const r = await toast.run(api.leave.yearEnd(), "Carry forward complete");
    setBusy(false);
    if (r) {
      setDone(r.employees);
      setText("");
    }
  };
  return (
    <>
      <PageHeader title="Year-end carry forward" subtitle="Run once, on or after 1 January." />
      <Card title="What this does">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
          <li>Every unused annual leave day moves to Carried forward. There is no cap and no expiry.</li>
          <li>Accrued days and days taken restart at 0 for the new year.</li>
          <li>A negative balance carries forward as 0.</li>
          <li>Employees who have left are not changed.</li>
        </ul>
        <p className="mt-3 rounded-[10px] bg-gold-soft px-3 py-2 text-sm text-ink">
          Before you run it, download the <strong>Leave balances</strong> report from Leave reports as a backup. It cannot be undone, only corrected by hand person by person.
        </p>
        <div className="mt-4 max-w-sm space-y-3">
          <Input label="Type CARRY FORWARD to confirm" value={text} onChange={(e) => setText(e.target.value)} />
          <Button variant="danger" loading={busy} disabled={text !== "CARRY FORWARD"} onClick={run}>
            Run carry forward
          </Button>
          {done !== null && <p role="status" className="text-sm text-ok">Done. {done} employees updated.</p>}
        </div>
      </Card>
    </>
  );
}
