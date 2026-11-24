"use client";

import { useEffect, useState } from "react";
import { fetchBlob } from "@/lib/api";
import { initials } from "@/lib/format";

interface Props {
  employeeId: number;
  name: string;
  hasPhoto?: boolean;
  /** bump to refetch after an upload */
  version?: number;
  className?: string;
  textClass?: string;
  tint?: boolean;
}

/** Fetches /employees/{id}/photo with the bearer token; falls back to initials. */
export function AuthImage({ employeeId, name, hasPhoto = true, version = 0, className = "", textClass = "text-2xl", tint }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPhoto) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    fetchBlob(`/employees/${employeeId}/photo`)
      .then((b) => {
        if (cancelled) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [employeeId, hasPhoto, version]);

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={`Photo of ${name}`} className={`object-cover ${className}`} />;
  }
  const bg = tint === false ? "bg-blue-soft" : employeeId % 2 ? "bg-blue-soft" : "bg-gold-soft";
  return (
    <div role="img" aria-label={`${name} (no photo)`} className={`flex items-center justify-center font-bold text-navy ${bg} ${textClass} ${className}`}>
      {initials(name)}
    </div>
  );
}
