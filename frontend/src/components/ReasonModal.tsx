"use client";

import { useState } from "react";
import { Button } from "./Button";
import { Textarea } from "./Fields";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  title: string;
  label: string;
  confirmLabel: string;
  required?: boolean;
  intro?: string;
  tone?: "primary" | "danger";
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
}

/** Asks for a short note or reason (reject a document, decline a request...). */
export function ReasonModal({ open, title, label, confirmLabel, required = false, intro, tone = "primary", onClose, onSubmit }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (required && !text.trim()) {
      setErr("A reason is required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(text.trim());
      setText("");
      setErr("");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not complete the action");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={busy} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {intro && <p className="mb-3 text-sm text-muted">{intro}</p>}
      <Textarea label={label} value={text} onChange={(e) => setText(e.target.value)} error={err} required={required} />
    </Modal>
  );
}
