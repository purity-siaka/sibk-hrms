"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { AppNotification } from "@/lib/types";
import { IconButton } from "./Button";

/** Bell in the top bar. Polls once a minute; clicking an item opens the sign-off it is about. */
export function NotificationBell({ onUnread }: { onUnread?: (n: number) => void }) {
  const router = useRouter();
  const [data, setData] = useState<{ unread: number; items: AppNotification[] }>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.notifications.list().then((d) => {
      setData(d);
      onUnread?.(d.unread);
    }).catch(() => undefined);
  }, [onUnread]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <IconButton label={data.unread ? `Notifications, ${data.unread} unread` : "Notifications"} onClick={() => { setOpen((o) => !o); load(); }} aria-expanded={open}>
        <Bell className="h-5 w-5" />
      </IconButton>
      {data.unread > 0 && (
        <span aria-hidden className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
          {data.unread > 9 ? "9+" : data.unread}
        </span>
      )}
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] rounded-[14px] border border-line bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-bold text-ink">Notifications</p>
            {data.unread > 0 && (
              <button className="text-xs font-semibold text-navy hover:underline" onClick={async () => { await api.notifications.readAll(); load(); }}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {data.items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Nothing yet.</li>}
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  className={`block w-full px-4 py-3 text-left hover:bg-[#F3F5FC] ${n.readAt ? "" : "bg-gold-soft/40"}`}
                  onClick={async () => {
                    await api.notifications.read(n.id).catch(() => undefined);
                    setOpen(false);
                    load();
                    router.push(n.link || "/signoffs");
                  }}
                >
                  <span className="block text-sm font-semibold text-ink">{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                  <span className="block text-[11px] text-muted">{fmtDateTime(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
