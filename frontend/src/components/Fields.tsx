"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const BASE =
  "w-full rounded-[10px] border bg-white px-3 py-2 text-sm text-ink placeholder:text-[#6B7590] min-h-[42px] focus:border-blue focus:outline focus:outline-2 focus:outline-blue/40 disabled:bg-[#F1F3F9] disabled:text-muted";

interface FieldShell {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

function Shell({ id, label, error, hint, required, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const describe = (id: string, error?: string, hint?: string) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

export function Input({ label, error, hint, className = "", required, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required}>
      <input
        id={id}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describe(id, error, hint)}
        className={`${BASE} ${error ? "border-danger" : "border-[#C5CEEA]"} ${className}`}
        {...rest}
      />
    </Shell>
  );
}

export function Select({
  label,
  error,
  hint,
  required,
  children,
  className = "",
  ...rest
}: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required}>
      <select
        id={id}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describe(id, error, hint)}
        className={`${BASE} ${error ? "border-danger" : "border-[#C5CEEA]"} ${className}`}
        {...rest}
      >
        {children}
      </select>
    </Shell>
  );
}

export function Textarea({ label, error, hint, required, className = "", ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required}>
      <textarea
        id={id}
        required={required}
        rows={3}
        aria-invalid={!!error}
        aria-describedby={describe(id, error, hint)}
        className={`${BASE} ${error ? "border-danger" : "border-[#C5CEEA]"} ${className}`}
        {...rest}
      />
    </Shell>
  );
}

export function Checkbox({ label, hint, ...rest }: { label: string; hint?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" className="mt-0.5 h-[18px] w-[18px] rounded border-[#8A97BD] accent-[#1D3B84] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue" {...rest} />
      <label htmlFor={id} className="text-sm text-ink">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </label>
    </div>
  );
}

/** Grid wrapper for form fields */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const c = cols === 1 ? "sm:grid-cols-1" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return <div className={`grid grid-cols-1 gap-4 ${c}`}>{children}</div>;
}

/** Filter bar search input with icon-free simple styling. */
export function SearchInput({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <input
      type="search"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${BASE} border-[#C5CEEA] sm:w-72`}
    />
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${BASE} border-[#C5CEEA] sm:w-auto`}>
      {children}
    </select>
  );
}
