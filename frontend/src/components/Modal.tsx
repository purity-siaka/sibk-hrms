"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "./Button";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl" | "2xl";
  /** render as a right side panel */
  side?: boolean;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ open, title, onClose, children, footer, size = "md", side = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea") ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const a = items[0];
      const z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const width = side ? "max-w-[520px]" : size === "2xl" ? "max-w-6xl" : size === "xl" ? "max-w-4xl" : size === "lg" ? "max-w-2xl" : "max-w-lg";
  return (
    <div className={`fixed inset-0 z-50 flex ${side ? "justify-end" : "items-center justify-center p-3 sm:p-6"}`}>
      <div className="absolute inset-0 bg-ink/50" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex w-full flex-col bg-white shadow-lift ${width} ${side ? "h-full" : "max-h-[92vh] rounded-2xl"}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {title}
          </h2>
          <IconButton label="Close dialog" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
