import type { HTMLAttributes, ReactNode } from "react";

interface Props extends HTMLAttributes<HTMLElement> {
  title?: string;
  action?: ReactNode;
  padded?: boolean;
}

export function Card({ title, action, padded = true, className = "", children, ...rest }: Props) {
  return (
    <section className={`rounded-[14px] border border-line bg-white shadow-card ${className}`} {...rest}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
          {title && <h2 className="text-[17px] font-bold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  tone = "navy",
  hint,
  href,
}: {
  label: string;
  value: number | string;
  tone?: "navy" | "gold" | "danger";
  hint?: string;
  href?: string;
}) {
  const color = tone === "gold" ? "text-gold-deep" : tone === "danger" ? "text-danger" : "text-navy";
  const body = (
    <>
      <div className={`text-[32px] font-bold leading-tight ${color}`}>{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </>
  );
  const cls = "block rounded-[14px] border border-line bg-white p-[18px] shadow-card";
  return href ? (
    <a href={href} className={`${cls} transition-shadow hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
