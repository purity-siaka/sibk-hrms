/* eslint-disable @next/next/no-img-element */

/** The Salaam Investment Bank star emblem as an app tile. */
export function Monogram({ size = 44 }: { size?: number }) {
  return <img src="/sibk-mark.png" alt="" aria-hidden width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-xl" />;
}

/** The full Salaam Investment Bank logo. */
export function Logo({ width = 220, className = "" }: { width?: number; className?: string }) {
  return (
    <img
      src="/sibk-logo.png"
      alt="Salaam Investment Bank"
      width={width}
      height={Math.round(width * (249 / 647))}
      style={{ width, height: "auto" }}
      className={className}
    />
  );
}

export function BrandTitle({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Monogram />
      <div className="leading-tight">
        <div className="text-[14px] font-bold text-white">Salaam Investment Bank</div>
        <div className={`font-semibold text-gold ${compact ? "text-xs" : "text-[13px]"}`}>HR Management System</div>
      </div>
    </div>
  );
}
