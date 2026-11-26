"use client";

import { useState, type FormEvent } from "react";
import { useDepartments, useReference } from "@/hooks/useReference";
import { ApiError } from "@/lib/api";
import { humanize } from "@/lib/format";
import type { Employee, EmployeeInput, EmploymentType, EmployeeStatus, EmployeeSummary, Role } from "@/lib/types";
import { Button } from "./Button";
import { Checkbox, FormGrid, Input, Select, Textarea } from "./Fields";

type Draft = Record<string, string>;

const keys = [
  "firstName", "lastName", "email", "phone", "jobTitle", "departmentId", "managerId", "employmentType", "status", "startDate",
  "probationEndDate", "contractEndDate", "exitDate", "gender", "nationality", "address", "emergencyContactName", "emergencyContactPhone",
  "emergencyContactRelation", "dateOfBirth", "nationalIdNo", "kraPin", "nssfNo", "shaNo", "bankName", "bankAccount",
] as const;

function toDraft(e?: Employee | null): Draft {
  const d: Draft = {};
  for (const k of keys) {
    const v = e ? (e as unknown as Record<string, unknown>)[k] : "";
    d[k] = v === null || v === undefined ? "" : String(v);
  }
  if (!e) {
    d.employmentType = "permanent";
    d.status = "probation";
  }
  return d;
}

interface Props {
  employee?: Employee | null;
  managers: EmployeeSummary[];
  onSubmit: (input: EmployeeInput) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}

export function EmployeeForm({ employee, managers, onSubmit, onCancel, submitLabel }: Props) {
  const ref = useReference();
  const departments = useDepartments();
  const [d, setD] = useState<Draft>(() => toDraft(employee));
  const [createUser, setCreateUser] = useState(false);
  const [role, setRole] = useState<Role>("employee");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const editing = !!employee;
  const set = (k: string) => (e: { target: { value: string } }) => setD((p) => ({ ...p, [k]: e.target.value }));
  const num = (s: string) => (s ? Number(s) : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!d.firstName.trim()) errs.firstName = "First name is required.";
    if (!d.jobTitle.trim()) errs.jobTitle = "Job title is required.";
    if (!d.startDate) errs.startDate = "Start date is required.";
    if (createUser && !d.email.trim()) errs.email = "An email address is needed to create a login.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const input: EmployeeInput = {
      firstName: d.firstName.trim(), lastName: d.lastName.trim(), email: d.email.trim(), phone: d.phone.trim(), jobTitle: d.jobTitle.trim(),
      departmentId: num(d.departmentId), managerId: num(d.managerId), employmentType: d.employmentType as EmploymentType,
      startDate: d.startDate, probationEndDate: d.probationEndDate || null, contractEndDate: d.contractEndDate || null,
      exitDate: d.exitDate || null, gender: d.gender, nationality: d.nationality.trim(), address: d.address.trim(),
      emergencyContactName: d.emergencyContactName.trim(), emergencyContactPhone: d.emergencyContactPhone.trim(),
      emergencyContactRelation: d.emergencyContactRelation.trim(), dateOfBirth: d.dateOfBirth || null,
      nationalIdNo: d.nationalIdNo.trim(), kraPin: d.kraPin.trim(), nssfNo: d.nssfNo.trim(), shaNo: d.shaNo.trim(),
      bankName: d.bankName.trim(), bankAccount: d.bankAccount.trim(),
    };
    if (editing) input.status = d.status as EmployeeStatus;
    if (!editing && createUser) {
      input.createUser = true;
      input.role = role;
    }
    setBusy(true);
    setFormError("");
    try {
      await onSubmit(input);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(Object.keys(err.fields).length ? "Please fix the highlighted fields." : err.message);
      } else setFormError("Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const eligibleManagers = managers.filter((m) => m.id !== employee?.id);

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {formError && (
        <p role="alert" className="rounded-[10px] border border-[#E7B7AF] bg-danger-soft px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-navy">Work information</legend>
        <FormGrid>
          <Input label="First name" value={d.firstName} onChange={set("firstName")} error={errors.firstName} required />
          <Input label="Last name" value={d.lastName} onChange={set("lastName")} error={errors.lastName} />
          <Input label="Work email" type="email" value={d.email} onChange={set("email")} error={errors.email} />
          <Input label="Phone" value={d.phone} onChange={set("phone")} error={errors.phone} />
          <Input label="Job title" value={d.jobTitle} onChange={set("jobTitle")} error={errors.jobTitle} required />
          <Select label="Department" value={d.departmentId} onChange={set("departmentId")} error={errors.departmentId}>
            <option value="">Not assigned</option>
            {departments.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </Select>
          <Select label="Manager" value={d.managerId} onChange={set("managerId")} error={errors.managerId}>
            <option value="">No manager</option>
            {eligibleManagers.map((x) => (
              <option key={x.id} value={x.id}>{x.fullName}</option>
            ))}
          </Select>
          <Select label="Employment type" value={d.employmentType} onChange={set("employmentType")} error={errors.employmentType}>
            {ref.employmentTypes.map((t) => (
              <option key={t} value={t}>{humanize(t)}</option>
            ))}
          </Select>
          <Input label="Start date" type="date" value={d.startDate} onChange={set("startDate")} error={errors.startDate} required />
          <Input label="Probation end date" type="date" value={d.probationEndDate} onChange={set("probationEndDate")} error={errors.probationEndDate} hint="Left empty, it is set to 3 months after the start date." />
          {(d.employmentType === "fixed_term" || d.employmentType === "temporary" || d.employmentType === "intern") && (
            <Input label="Contract end date" type="date" value={d.contractEndDate} onChange={set("contractEndDate")} error={errors.contractEndDate} />
          )}
          {editing && (
            <Select label="Status" value={d.status} onChange={set("status")} error={errors.status}>
              {ref.employeeStatuses.map((s) => (
                <option key={s} value={s}>{humanize(s)}</option>
              ))}
            </Select>
          )}
          {editing && d.status !== "active" && d.status !== "probation" && (
            <Input label="Exit date" type="date" value={d.exitDate} onChange={set("exitDate")} error={errors.exitDate} />
          )}
        </FormGrid>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-navy">Private information</legend>
        <FormGrid>
          <Input label="Date of birth" type="date" value={d.dateOfBirth} onChange={set("dateOfBirth")} error={errors.dateOfBirth} />
          <Select label="Gender" value={d.gender} onChange={set("gender")}>
            <option value="">Not stated</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </Select>
          <Input label="Nationality" value={d.nationality} onChange={set("nationality")} />
          <Input label="National ID / Passport no." value={d.nationalIdNo} onChange={set("nationalIdNo")} />
          <Input label="KRA PIN" value={d.kraPin} onChange={set("kraPin")} />
          <Input label="NSSF no." value={d.nssfNo} onChange={set("nssfNo")} />
          <Input label="SHA no." value={d.shaNo} onChange={set("shaNo")} />
          <Input label="Bank name" value={d.bankName} onChange={set("bankName")} />
          <Input label="Bank account no." value={d.bankAccount} onChange={set("bankAccount")} />
        </FormGrid>
        <Textarea label="Physical address" value={d.address} onChange={set("address")} />
        <FormGrid cols={3}>
          <Input label="Alternative contact person" value={d.emergencyContactName} onChange={set("emergencyContactName")} />
          <Input label="Alternative phone number" value={d.emergencyContactPhone} onChange={set("emergencyContactPhone")} />
          <Input label="Relationship" value={d.emergencyContactRelation} onChange={set("emergencyContactRelation")} />
        </FormGrid>
      </fieldset>

      {!editing && (
        <fieldset className="space-y-3 rounded-[10px] bg-[#F8F9FD] p-4">
          <legend className="sr-only">Portal login</legend>
          <Checkbox label="Create a portal login for this employee" hint="A temporary password is shown once after saving. They must change it at first sign-in." checked={createUser} onChange={(e) => setCreateUser(e.target.checked)} />
          {createUser && (
            <Select label="Access level" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="employee">Employee (own portal only)</option>
              <option value="manager">Manager (sees their team and onboarding tasks)</option>
              <option value="hr_officer">HR officer</option>
              <option value="hr_admin">HR administrator</option>
            </Select>
          )}
        </fieldset>
      )}

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
