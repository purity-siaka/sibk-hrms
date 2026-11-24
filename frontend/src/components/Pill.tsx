import type { ReactNode } from "react";
import { humanize } from "@/lib/format";

export type Tone = "ok" | "wait" | "bad" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  wait: "bg-gold-soft text-gold-deep",
  bad: "bg-danger-soft text-danger",
  info: "bg-blue-soft text-navy",
  neutral: "bg-[#EDEFF5] text-muted",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  verified: "ok",
  approved: "ok",
  active: "ok",
  done: "ok",
  repaid: "ok",
  open: "ok",
  hired: "ok",
  pending: "wait",
  probation: "wait",
  in_progress: "info",
  disbursed: "info",
  draft: "neutral",
  on_notice: "wait",
  rejected: "bad",
  missing: "bad",
  exited: "neutral",
  closed: "neutral",
  not_applicable: "neutral",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <Pill tone={STATUS_TONE[status] ?? "neutral"}>{label ?? humanize(status)}</Pill>;
}
