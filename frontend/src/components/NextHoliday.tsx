"use client";

import { fmtDate } from "@/lib/format";

/** Shows only the next public holiday. It is worked out from today's date, so it moves on by itself. */
export function NextHoliday({ holidays }: { holidays: { name: string; date: string }[] }) {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const next = [...holidays].sort((a, b) => a.date.localeCompare(b.date)).find((h) => h.date >= iso);
  if (!next) return null;
  return (
    <p className="text-sm text-muted">
      Next public holiday: <strong className="text-ink">{next.name}</strong> ({fmtDate(next.date)})
    </p>
  );
}
