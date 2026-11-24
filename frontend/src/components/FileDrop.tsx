"use client";

import { UploadCloud } from "lucide-react";
import { useId, useRef, useState } from "react";
import { fmtSize } from "@/lib/format";

interface Props {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  accept: string;
  maxBytes: number;
  hint?: string;
  error?: string;
}

/** Keyboard accessible file chooser with drag and drop and client side size check. */
export function FileDrop({ label, file, onChange, accept, maxBytes, hint, error }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [localError, setLocalError] = useState("");

  const take = (f: File | undefined) => {
    if (!f) return;
    if (f.size > maxBytes) {
      setLocalError(`File is too large (${fmtSize(f.size)}). The limit is ${fmtSize(maxBytes)}.`);
      return;
    }
    setLocalError("");
    onChange(f);
  };
  const err = localError || error;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files?.[0]);
        }}
        className={`flex flex-col items-center gap-1 rounded-[10px] border-2 border-dashed px-4 py-5 text-center transition-colors ${
          over ? "border-gold bg-gold-soft" : "border-[#C5CEEA] bg-[#FAFBFE]"
        } focus-within:outline focus-within:outline-2 focus-within:outline-blue`}
      >
        <UploadCloud className="h-6 w-6 text-navy" aria-hidden />
        <p className="text-sm text-ink">
          {file ? (
            <span className="font-semibold">
              {file.name} <span className="font-normal text-muted">({fmtSize(file.size)})</span>
            </span>
          ) : (
            "Drag a file here or choose one"
          )}
        </p>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          onChange={(e) => take(e.target.files?.[0])}
          className="w-full max-w-[260px] text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-blue"
        />
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {err && (
        <p role="alert" className="text-xs font-medium text-danger">
          {err}
        </p>
      )}
    </div>
  );
}

export const DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,.docx";
export const DOC_MAX = 10 * 1024 * 1024;
export const PHOTO_MAX = 2 * 1024 * 1024;
