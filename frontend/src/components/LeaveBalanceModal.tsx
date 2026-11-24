"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Checkbox, FormGrid, Input } from "./Fields";
import { Modal } from "./Modal";
import { api, ApiError } from "@/lib/api";
import type { LeaveBalance } from "@/lib/types";

/** HR adjusts accrued and carried-forward days, and whether the person can approve leave. */
export function LeaveBalanceModal({ open, onClose, onDone, employeeId, name, balance }: { open: boolean; onClose: () => void; onDone: () => void; employeeId: number; name: string; balance: LeaveBalance }) {
  const [accrued, setAccrued] = useState("0");
  const [carried, setCarried] = useState("0");
  const [noApprove, setNoApprove] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAccrued(String(balance.accruedDays));
      setCarried(String(balance.carriedForwardDays));
      setNoApprove(balance.doesNotApprove);
      setErrors({});
      setFormError("");
    }
  }, [open, balance]);

  const save = async () => {
    setBusy(true);
    setErrors({});
    setFormError("");
    try {
      await api.leave.updateBalance(employeeId, { accruedDays: Number(accrued), carriedForwardDays: Number(carried), doesNotApprove: noApprove });
      onDone();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else setFormError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Leave settings: ${name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}
        <FormGrid>
          <Input label="Accrued days this year" type="number" min={0} step="0.25" value={accrued} onChange={(e) => setAccrued(e.target.value)} error={errors.accruedDays} />
          <Input label="Carried forward days" type="number" min={0} step="0.25" value={carried} onChange={(e) => setCarried(e.target.value)} error={errors.carriedForwardDays} />
        </FormGrid>
        <p className="text-sm text-muted">Days taken ({balance.takenDays}) update automatically when annual leave is approved or cancelled. Every change here is recorded in the audit log.</p>
        <Checkbox label="This person does not approve leave" hint="Their team's requests go to HR instead." checked={noApprove} onChange={(e) => setNoApprove(e.target.checked)} />
      </div>
    </Modal>
  );
}
